# DRIVER_SOS_WORKFLOW_SPEC.md — Patient ↔ Driver dispatch, SOS alerts, live trips

You are a coding agent extending an existing app (CareLink: Next.js App Router + TypeScript, MongoDB, Better Auth, Tailwind). This file is self-contained. Work **one phase at a time**, run the tests, commit with the prefix `drv:`, then **stop and report** before starting the next phase.

The product owner is not a specialist. Keep code simple, readable, and commented. Prefer boring and correct over clever.

---

## 0. Rules that apply everywhere

1. **Inspect the repo first, extend, don't duplicate.** The repo already has multi-driver SOS dispatch offers (see commit `095c8ec`), a `holds` collection, role-based auth, and `lib/ranking.ts`. Find what exists for requests, offers, driver availability, maps, and auth, and reuse it. Write what you will reuse into `docs/DRIVER_COMMITS.md` before coding.
2. **The server is the source of truth.** The browser never decides who won an offer, what a status is, or when an offer expires. It only displays server state.
3. **Atomic claims.** Accepting a request must be a single conditional database update (for example `findOneAndUpdate` with the expected status in the filter). Two drivers accepting at the same time must produce exactly one winner.
4. **Hard rules for access.**
   - A patient can read and change only their own requests.
   - A driver can read and change only trips assigned to them, and see offers addressed to them.
   - A patient sees the driver's live location only **after** the driver accepts.
   - A driver sees the patient's exact location only **after** accepting. Before accepting, show distance and a rough area only.
5. **All tunable numbers live in one config file** (`lib/dispatch/constants.ts`). No magic numbers in components.
6. **No hardcoded demo data inside components.** Test data comes from JSON or seed scripts.
7. **Follow the existing auth and role conventions** in the repo. Do not invent a second auth system.
8. **No new paid or keyed third-party service** without asking. Use what the repo already uses for maps. If routing is unavailable, fall back to a straight line and say so in the UI.
9. **Theme.** Use the project palette only: primary `#1E5A8E`, confirmed/success `#2E7D4F`, pending/uncertain `#C98A1F`, red `#C0362C` **only for SOS, failures, and rejections**, background `#F6F8F9`, text `#1B1F23`. Plain labels, no gradients, no sparkle. If the repo already defines theme tokens, use those and map them to this palette.
10. **TypeScript only.** Tests with `vitest`. Commit prefix `drv:`.

---

## 1. Feature checklist (each item needs a visible artifact)

**SOS**
- F1 Patient taps SOS. One tap sends it, with a short undo/cancel window. Duplicate taps never create a second active SOS.
- F2 An SOS alert pops up on every eligible online driver's dashboard, on **any tab**, with a **10 second** countdown, Accept and Decline, and auto-dismiss at zero.
- F3 If nobody accepts in time, the SOS is re-offered to the next drivers. After the maximum rounds, the patient sees a clear "no driver found" state with a fallback instruction.

**Normal requests**
- F4 Patient creates a normal driver request (pickup, destination, urgency, notes).
- F5 It appears in the driver's **Requests** tab (a list, no countdown popup), live, without a manual refresh.

**Accept and trip**
- F6 When a driver accepts (SOS or normal), the dashboard **automatically switches to the Current Trip tab**.
- F7 The map shows driver location, patient location, and the route between them, with distance and ETA.
- F8 GPS tracking: the driver's position updates automatically while online or on a trip. The map, the driver's task details, and the patient's **Current Emergency Request** panel all update from the same server data.
- F9 Trip status flow with driver buttons: `accepted` → `en_route_to_patient` → `arrived_at_patient` → `picked_up` → `en_route_to_hospital` → `completed`. Cancel is allowed from any active state.

**Patient side**
- F10 Patient **Current Emergency Request** panel: status timeline, driver name/vehicle/contact, live map, ETA, cancel button.

**Dashboard quality**
- F11 The broken driver dashboard UI is audited and fixed to match the theme (see Phase 0).
- F12 Driver history/task tab: completed, cancelled, and missed SOS entries.

---

## 2. Data model (extend existing collections; add only what is missing)

**Request** (`type: "sos" | "normal"`): `_id`, `patientId`, `type`, `status`, `pickup {lat, lng, address?, accuracyM?}`, `destination {hospitalId?, lat?, lng?}`, `urgency`, `notes`, `idempotencyKey`, `assignedDriverId?`, `createdAt`, `acceptedAt?`, `completedAt?`, `cancelledReason?`.

**Offer**: `_id`, `requestId`, `driverId`, `round`, `status`, `expiresAt` (server time), `createdAt`, `respondedAt?`.

**Driver presence**: `driverId`, `online`, `lastLocation {lat, lng, accuracyM, heading?, speed?}`, `lastLocationAt`, `currentTripId?`.

**Location ping** (history during trips): `tripId`, `driverId`, `lat`, `lng`, `at`. Delete after `LOCATION_RETENTION_DAYS`.

**Request state machine** (every transition is appended to a log with timestamp, actor, and reason):

```
created → offered → accepted → en_route_to_patient → arrived_at_patient
        → picked_up → en_route_to_hospital → completed

offered → no_driver_found     (all rounds exhausted)
any active state → cancelled
normal request: created → expired   (nobody accepted in NORMAL_REQUEST_EXPIRY_MIN)
```

**Offer state machine:** `pending → accepted | declined | expired | superseded`. When one driver accepts, every other pending offer for that request becomes `superseded` in the same operation.

**Invariants (checked in tests and after every transition):**
- I1 A request has at most one `accepted` offer.
- I2 A driver has at most one active trip.
- I3 A patient has at most one active SOS.
- I4 Only the allowed transitions above ever happen. A violation throws loudly.
- I5 A driver already on a trip is never offered a new SOS or normal request.

---

## 3. Dispatch rules

- **SOS:** offer to the `SOS_OFFER_BATCH_SIZE` nearest eligible drivers **at the same time**. Eligible means online, not on a trip, recent location (not stale), within `SOS_SEARCH_RADIUS_KM`. Each offer expires `SOS_OFFER_SECONDS` (minimum 40 seconds) after creation. On expiry with no accept, start the next round with the next nearest drivers who have not been offered. Stop after `SOS_MAX_ROUNDS`, then `no_driver_found`.
- **Normal request:** visible to all eligible online drivers in the Requests tab, nearest first. No popup. Expires after `NORMAL_REQUEST_EXPIRY_MIN`.
- **Accept:** one atomic conditional update. The loser gets a clear "already taken" message and the card disappears.
- **Expiry** is driven by the server (`expiresAt`). The client countdown is computed from server time with a clock offset, so a wrong device clock cannot keep a popup alive.
- **Optional, only if time allows:** suggest the destination hospital using the existing allocation engine (`lib/allocation/engine.ts`) for ICU/emergency bed availability. This must reuse the engine, not copy it, and the Grok chatbot must not affect dispatch.

---

## 4. Real-time updates

Use **polling every `POLL_SECONDS` (default 3)** with a `since` cursor or ETag as the default. It is simple and works on any host. If the repo already uses SSE or websockets, use that instead. Do not add new infrastructure.

- Driver feed endpoint returns: pending offers, open normal requests, current trip, presence.
- Patient endpoint returns: active request, offer/assignment status, driver profile and last location (only after accept).
- Pause polling when the page is hidden for long, and resume with an immediate fetch when visible again.

**API surface (adapt names to existing conventions):**

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/sos` | patient | create SOS (idempotency key required) |
| POST | `/api/requests` | patient | create normal request |
| GET | `/api/patient/active-request` | patient | current request and driver location |
| POST | `/api/requests/:id/cancel` | patient or assigned driver | cancel |
| GET | `/api/driver/feed` | driver | offers, requests, current trip |
| POST | `/api/offers/:id/accept` | driver | atomic accept |
| POST | `/api/offers/:id/decline` | driver | decline |
| POST | `/api/trips/:id/status` | assigned driver | advance status |
| POST | `/api/driver/location` | driver | location ping |
| POST | `/api/driver/presence` | driver | online/offline toggle |

---

## 5. GPS tracking

- Use `navigator.geolocation.watchPosition` with high accuracy while the driver is online. Send a ping every `LOCATION_PING_SECONDS` (default 5), throttled, and only if the position changed meaningfully.
- Geolocation needs **HTTPS** (or localhost). Handle: permission denied, position unavailable, timeout. Show a visible "Location sharing: on / off / blocked" indicator on the driver dashboard.
- A location older than `STALE_LOCATION_SECONDS` (default 30) is marked stale. Stale drivers are not offered SOS. During a trip, the patient sees "Driver location last updated Ns ago".
- Stop sending pings when the driver goes offline or the trip completes.
- Patient location is captured at request time (and may refresh while the request is active). Pickup stays editable for normal requests.
- Store accuracy with each ping. Do not draw a confident route from a position with very poor accuracy; show the accuracy circle instead.

---

## 6. Map and route

- Use the map library already in the repo. If none exists, ask before adding one.
- Show: driver marker, patient marker, destination (hospital) marker, route line, distance, ETA.
- Move the driver marker smoothly as pings arrive. Fit bounds when the trip starts, and give the user a "recenter" button after they pan.
- Recalculate the route at most every `ROUTE_REFRESH_SECONDS` (default 30), or when the driver deviates more than `ROUTE_DEVIATION_M` from it. If routing fails, draw a straight line and label it "approximate".
- ETA changes of more than 10 minutes update the patient's panel with a visible notice.
- Make sure the map never covers modals. Fix any `z-index` issue (map libraries commonly sit above overlays).

---

## 7. Driver dashboard UI

Tabs: **Overview**, **Requests**, **Current Trip**, **Task History**.

- **Online toggle and location indicator** at the top.
- **SOS alert modal:** full overlay on **any tab**, red accent (SOS is the one place red is expected), patient name/urgency, distance and rough area, a 10-second countdown ring, **Accept** and **Decline**. Auto-dismisses at zero and logs a "missed" entry. If the patient cancels or another driver accepts while it is open, it closes with a short message. Optional: sound and vibration, and the Notification API plus title flash when the browser tab is in the background (ask permission, degrade gracefully).
- **Requests tab:** cards for normal requests with urgency, distance, notes, Accept. Live updates, no refresh.
- **Current Trip tab:** auto-selected when a trip is accepted. Map, patient details (exact location now visible), big status button for the next step, ETA, call/contact if the repo supports it, cancel.
- **Task History tab:** completed, cancelled, and missed SOS, with times.
- Empty states for every tab. Loading and error states for every fetch.

---

## 8. Patient UI

- **SOS button:** prominent, always reachable. One tap sends, with a short (about 5 second) "Undo" bar. After sending, the screen shows the Current Emergency Request panel.
- **Current Emergency Request panel:** status timeline (Searching for driver → Driver accepted → On the way → Arrived → Picked up → Heading to hospital → Completed), driver name and vehicle, live map, ETA, last updated time, cancel button, and clear messages for "no driver found" and cancellation.
- **Normal request form:** pickup (auto from GPS, editable), destination hospital, urgency, notes. Show the same Current Request panel after submitting.
- Clear message and instruction when location permission is denied.
- For `no_driver_found`, show the fallback instruction from config (`EMERGENCY_FALLBACK_TEXT`). Do not hardcode a phone number in the component.
- Label the app clearly if it runs in demo/simulation mode.

---

## 9. Edge cases that must be handled and tested

1. Two drivers accept the same SOS at once → exactly one wins, the other sees "already taken".
2. Driver accepts after the offer expired → rejected with a clear message.
3. Patient cancels while the popup is showing → popup closes.
4. Patient taps SOS twice, or retries after a network error → still one active SOS (idempotency key).
5. Driver goes offline or loses GPS mid-offer or mid-trip → offer expires normally; during a trip, the patient sees the stale-location notice.
6. Driver is already on a trip → no new offers.
7. Driver or patient reloads the page → state restores from the server.
8. Same user open in two tabs → no duplicate popups or double accepts.
9. Wrong device clock → countdown still correct (server time).
10. Unauthorized access (another patient's request, another driver's trip) → 403.
11. Patient's location unavailable → request is blocked with a clear prompt to enter a pickup address.
12. Driver declines or ignores every offer → rounds exhaust, `no_driver_found`.

---

## 10. Phases

### Phase 0 — audit and UI baseline (about 45 min)
- Create branch `drv-workflow` and record `git rev-parse HEAD` in `docs/DRIVER_COMMITS.md` as `START_COMMIT`. Tag `drv-start`.
- Inspect and write down what you will reuse: existing offers, driver availability, request model, auth roles, map library, theme tokens.
- **Audit the broken driver dashboard UI** at 375px, 768px, and 1280px widths. List every defect (overlap, overflow, wrong colors, broken layout, z-index, spacing, unreadable text) in `docs/UI_AUDIT.md` with the file responsible.
- Fix the layout and theme issues, no new features yet. Run the type-check and build. Commit and stop.

### Phase 1 — data model and state machine (about 60 min)
- Add or extend types, the config file, the request and offer state machines, and invariants I1–I5. Pure functions, no UI.
- Tests: allowed and forbidden transitions, invariants, idempotency key behavior.

### Phase 2 — dispatch and APIs (about 90 min)
- Implement SOS rounds, offer expiry, atomic accept, decline, supersede, cancel, and the endpoints in section 4 with role checks.
- Tests: concurrent accept (`Promise.all`), expiry, round progression, `no_driver_found`, driver-busy exclusion, 403 cases.

### Phase 3 — driver dashboard (about 90 min)
- Tabs, online toggle, SOS alert modal with the 10-second countdown on any tab, Requests tab, auto-switch to Current Trip on accept, Task History, empty/loading/error states.

### Phase 4 — patient side (about 60 min)
- SOS button with undo, normal request form, Current Emergency Request panel with the status timeline and cancel.

### Phase 5 — GPS and map (about 90 min)
- Driver location watcher and pings, stale-location handling, map with both markers and route, ETA, smooth marker updates, route refresh, the same live data on the driver's trip tab and the patient's panel.

### Phase 6 — test tooling and verification (about 45 min)
- Add `npm run sim-driver`, a **dev-only** script that moves a fake driver along a path and posts pings, so the live map can be demonstrated without physically moving.
- Write `docs/DRIVER_QA.md`: a manual checklist run with two browsers (one patient, one driver) covering every item in sections 1 and 9.
- Run the full test suite, type-check, and production build. Commit and stop.

---

## 11. Config constants (`lib/dispatch/constants.ts`)

`SOS_OFFER_SECONDS = 40` (minimum), `SOS_REQUEST_TIMEOUT_SECONDS >= SOS_OFFER_SECONDS + 5`, `SOS_OFFER_BATCH_SIZE = 3`, `SOS_MAX_ROUNDS = 3`, `SOS_SEARCH_RADIUS_KM`, `NORMAL_REQUEST_EXPIRY_MIN = 15`, `POLL_SECONDS = 3`, `LOCATION_PING_SECONDS = 5`, `STALE_LOCATION_SECONDS = 30`, `ROUTE_REFRESH_SECONDS = 30`, `ROUTE_DEVIATION_M = 200`, `LOCATION_RETENTION_DAYS`, `EMERGENCY_FALLBACK_TEXT`. Choose sensible defaults where unset and report them.

---

## 12. Definition of done

- Patient taps SOS → popup appears on an online driver's dashboard within about one polling interval, shows a 10-second countdown, and auto-dismisses.
- A normal request appears in the Requests tab without a refresh.
- Accepting switches the driver to Current Trip, and both the driver and patient maps show both locations and the route.
- Moving the driver (real or `sim-driver`) updates the driver's trip tab and the patient's Current Emergency Request panel automatically.
- Concurrent accept, expiry, idempotency, invariant, and authorization tests all pass. Type-check and production build pass.
- The dashboard matches the theme at 375, 768, and 1280px with no overlap or overflow.
- Your final message lists what was built, what was skipped, and every assumption you made.

---

## 13. Assumptions the owner has not confirmed (decide a default, then report)

- Polling is acceptable instead of websockets.
- Normal requests are visible to all eligible drivers; SOS goes to the nearest few.
- The driver sees only distance and rough area before accepting.
- Sound and browser notifications are optional extras.
- Payment, driver verification, ratings, and chat/call between patient and driver are **out of scope** unless the repo already has them.

**Never cut:** atomic accept, the 10-second SOS popup, server-side expiry, role checks, and the concurrent-accept and idempotency tests.
