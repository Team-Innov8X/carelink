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
