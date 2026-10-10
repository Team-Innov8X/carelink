# CareLink

CareLink is an emergency coordination dashboard for dispatch, hospital capacity, patient handoff, and pharmacy stock.

## Run locally

1. Install dependencies with `npm install`.
2. Start a MongoDB instance and copy `.env.example` to `.env.local`.
3. Set `MONGODB_URI` to your MongoDB connection string and replace `BETTER_AUTH_SECRET` with a random secret.
4. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).

### Maps

The dashboard uses Leaflet with OpenStreetMap tiles. No Google Maps key or Google Maps API is required. Hospital ETAs and recommendations currently use the operational data stored by CareLink; the dashed handoff line on the map connects the selected ambulance and hospital.

On first load, the app initializes its operational snapshot from the built-in sample data. Hospital capacity, emergency requests, pharmacy inventory, ambulance state, and medicine orders then sync between clients. If MongoDB is unavailable, the UI uses browser storage; those changes will not be shared with other devices.

### Smart Match and AI assistance

Smart Match uses active/busy MongoDB hospital records and currently available/on-call doctor and resource records. Required non-bed facilities are eligibility rules: a hospital is removed when a requested item is unavailable or its record is missing. A requested bed category remains eligible when the bed record exists but its count is zero, because the patient can join that hospital's queue. The maximum travel time is also a hard eligibility rule. Optional preferred facilities affect the resource-fit score but do not remove a hospital from results. Patients can still queue for a selected bed whose current available count is zero.

The deterministic score is computed on a 0–100 scale. For each result, factors are in [0, 1] and weights are non-negative. The scorer normalizes weights to sum to 1 and calculates `base = 100 × (resourceFit × wR + travelFit × wT + freshness × wF + relevantCapacity × wA)`. The final score is `round(base × statusFactor, 2)`, where active hospitals use 1 and busy hospitals use 0.8. Dispatcher settings control four weights that must total 100%; the defaults are resource fit 45%, travel fit 25%, freshness 20%, and relevant available capacity 10%. The explicit ranking preferences redistribute those same four factors while preserving a 10% capacity contribution. Existing three-weight settings are upgraded in memory by preserving their relative proportions across 90% of the score and assigning 10% to available capacity; no database migration is needed.

Required resources are eligibility rules: a hospital that lacks an available non-bed requirement is excluded. A requested bed can remain eligible with zero available units when its matching bed record exists, because the patient can join its queue. Optional preferred resources do not exclude hospitals. Resource fit is the fraction of all requested (required plus preferred) resources currently available. Travel fit falls linearly from 1 at 0 minutes to 0 at 60 minutes. Freshness is the mean freshness of records matching the requested resources only; a missing record or timestamp receives 0, and freshness decays by half every six hours. Relevant capacity is the mean available quantity across requested resources, with each resource's credit capped at three units; unrelated inventory does not add points. A zero-capacity queueable bed receives no resource-fit or capacity credit. The result exposes each factor, its weighted points, and the status deduction, which reproduce the final score up to rounding.

Missing travel time and relevant inventory timestamps receive zero credit. Candidates are de-duplicated by hospital ID; ties sort by travel time, then stable case-sensitive hospital name and ID. Scores compare current records; they are not clinical judgments or AI predictions. Limitations include known text aliases rather than clinical ontology, a fixed three-unit capacity saturation point, a 60-minute travel-fit scale, an estimated straight-line ETA when route data is unavailable, and a fixed 0.8 factor for busy hospitals. The weights and thresholds are transparent heuristics, not clinically validated outcomes. Keep hospital, resource, and doctor records current. Balanced weights use the shared dispatcher settings; users can also prioritize resources, travel time, or data freshness. Optional preferred facilities can be entered separately from required facilities.

The Smart Match search box and refinement assistant accept ordinary language and convert it into validated criteria. Required facilities remain deterministic eligibility rules; language such as “prefer”, “ideally”, or “if possible” is placed in the optional preference list. Configure the server-only Gemini key in `.env.local` to enable AI interpretation and explanation emphasis:

```dotenv
GEMINI_API_KEY=your-google-ai-studio-key
```

The backend uses Google's official `@google/genai` SDK with the stable `gemini-3.8-flash` model. Never add a `NEXT_PUBLIC_` prefix to the key. The model parses only search criteria; the server validates them and the existing database matcher retrieves candidates and calculates scores. Explanation requests re-run the same authorized matching endpoint and give Gemini only the calculated match facts. Gemini selects one allowed explanation emphasis, then the server builds the returned explanation from canonical templates and verified fields. Model output cannot create facilities, stock, distances, scores, or availability claims. With no key in development, the API returns an actionable configuration warning and uses the deterministic local parser/explanation; Gemini timeouts, rate limits, API errors, and invalid output also fall back. Symptom Triage can continue to use its separate Grok/Groq settings. To try Smart Match, sign in as a patient or dispatcher, open **Smart Match**, enter an emergency type and location (patients can use the browser location control), then describe the specialty, bed, travel limit, pharmacy, or preference.

### Pharmacy Smart Match

The **Pharmacies** selector joins registered pharmacy location/contact records with persisted `appState` medicine stock through `POST /api/pharmacy/matches`. It matches the requested medicine record, quantity, search radius, and patient/incident coordinates. Pharmacy stock is labeled verified only when a pharmacy-specific `pharmacyInventoryLog` entry from the last six hours has a quantity equal to the current shared stock value. Missing, old, or inconsistent audit data is shown as unverified and cannot be ordered from Smart Match. The order button uses the existing `POST /api/pharmacy` compare-and-set stock decrement; the pharmacy still must confirm the order. Contact details are shown only when present in the stored pharmacy record. Pharmacy onboarding links the organization record to its stock account by database ID.

Dispatcher settings configure pharmacy score weights for medicine identity, verified stock, and distance. The defaults are 45%, 40%, and 15%. The score is the normalized weighted sum of those factors on a 0–100 scale; a missing or insufficient mandatory stock check remains ineligible for ordering regardless of score. Demo pharmacies and medicines are flagged in development and visibly labeled. Matching excludes records flagged `isDemo` in production. Demo inventory must not be used to represent live provider availability.

### Database seed data

The sample hospital, resource, and hold records are maintained in `scripts/seed/seed-database.ts`; `POST /api/seed` calls this helper. Seeding clears the hospitals, resources, and holds collections before inserting the sample records, so use it only with a local or disposable database.

## SOS dispatch API

All SOS endpoints require an authenticated session. Patient requests are visible to logged-in ambulance drivers who have registered themselves as available. Drivers poll for new work with `GET /api/sos/available`; acceptance is atomic, so only one driver can claim a request. The driver then receives the patient's coordinates and a Google Maps directions URL. After accepting, the driver can retrieve equipment-matched hospitals ordered by distance.

### Endpoints

- `POST /api/sos` (patient): `{ "location": { "latitude": 12.97, "longitude": 77.59 }, "incidentType": "cardiac emergency", "requiredEquipment": ["defibrillator"] }`
- `GET /api/sos/available` (ambulance driver): list active SOS offers and distance from the driver's last known location.
- `PATCH /api/sos/available` (ambulance driver): `{ "available": true, "location": { "latitude": 12.98, "longitude": 77.60 } }` to register availability and update location. Send `available: false` to go offline.
- `POST /api/sos/:id/accept` (ambulance driver): accepts an offer; optional `{ "location": { ... } }` refreshes the driver's location. Response includes patient coordinates and `directionsUrl`.
- `GET /api/sos/:id` (patient or assigned driver): request status.
- `GET /api/sos/:id/hospitals?limit=5` (assigned driver): nearest hospitals whose `equipment` includes every requested item; response includes distances and map directions.

The MongoDB `drivers` collection stores `{ userId, available, location }`. Add hospitals to the `hospitals` collection as `{ name, address, location: { latitude, longitude }, equipment: ["defibrillator", "ventilator"] }`. Equipment matching ignores letter case. The driver app should poll `GET /api/sos/available` (for example, every few seconds while on duty); this implementation does not send push notifications. Hospital records and equipment inventory must be kept current by the hospital onboarding/admin flow.

## Learn More

## Useful commands

- `npm run dev` — development server
- `npm run build` — production build
- `npm start` — serve the production build
- `npm run lint` — run ESLint
