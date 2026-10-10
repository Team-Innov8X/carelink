# Driver SOS workflow work

## Phase 0 baseline

- Branch: `drv-workflow`
- `START_COMMIT`: `77595460d1e499788a3a46bef0a0acdc874c6b43`
- Tag: `drv-start` points to `START_COMMIT`.
- The working tree already contained unrelated onboarding and MongoDB index fixes when this branch was created. They are being preserved and are not included in the Phase 0 audit commit.

## Existing code to reuse

- **SOS requests and lifecycle:** `sosRequests` in `lib/sos.ts`; request creation/listing in `app/api/sos/route.ts`; patient cancellation and request status in `app/api/sos/[id]/cancel/route.ts` and `app/api/sos/[id]/route.ts`.
- **Offers and dispatch:** `dispatch_offers`, `drivers`, `sosCollections`, `advanceDispatch`, and `expireAndReofferDriverOffers` in `lib/sos.ts`; driver offer feed and availability are currently combined in `app/api/sos/available/route.ts`; accept/reject are under `app/api/sos/[id]/`.
- **Trip updates and history:** `tripStage` and `tripTimestamps` on `SosRequest`; `app/api/sos/[id]/trip/route.ts`, `/arrive`, `/complete`, `/cancel`, and `/history`.
- **Authorization:** Better Auth in `lib/auth.ts` and `lib/auth-utils.ts`; routes call `requireRole` with the existing `patient`, `driver`/`ambulance_driver`, and `dispatcher` roles.
- **Driver UI and polling:** `app/driver-dashboard/page.tsx` and `components/driver/LiveSOSRequests.tsx`.
- **Patient UI:** `components/patient/PatientEmergencyRequestsView.tsx`, `PatientSOSStatus.tsx`, `PatientHomeRequestBox.tsx`, and `RoutineDriverBookingView.tsx`; `lib/client-sos.ts` shares the patient request fetch.
- **Map:** `components/common/MapView.tsx` uses the already-installed Leaflet library. Do not add a second map library or paid/keyed routing service.
- **Allocation and ranking:** `lib/allocation/engine.ts` and `lib/ranking.ts` exist. The allocation engine is the reusable hospital-capacity flow; ranking is not a driver-dispatch substitute.
- **Theme:** global defaults live in root `index.css`; the project palette is currently Tailwind slate/sky/rose plus CSS variables. The spec palette differs, so no token or UI changes are made under the owner's preserve-current-UI instruction.

## Phase log

| Phase | Status | Commit |
|---|---|---|
| 0 — audit and UI baseline | Complete; visual review is limited by the signed-out browser session | `drv: document existing SOS workflow and UI audit` |
| 1 — data model and state machine | Complete; pure types, shared config, transition rules, invariants, and tests; no UI/API behavior changed | `drv: add dispatch state machine and invariants` |
| 2 — dispatch and APIs | Complete; SOS idempotency, round dispatch, normal requests, guarded accept/decline/cancel, and API aliases | `drv: implement dispatch APIs and atomic acceptance` |
| 3 — driver dashboard | Complete; four driver tabs, live normal requests, server-clock SOS alerts, active trip/map view, and task history | `drv: complete driver dashboard workflow` |
| 4 — patient side | Complete; one-tap SOS with short undo, address fallback, current-request timeline/map, and normal-request restoration | `drv: complete patient request workflow` |

## Phase 1 implementation notes

- Added canonical request, offer, driver-presence, location-ping, snapshot, and transition-log types under `lib/dispatch/state-machine.ts`.
- Added pure request/offer transitions, scoped patient/idempotency-key retry resolution, atomic in-memory offer acceptance with sibling superseding, and I1–I5 invariant validation.
- Added centralized configuration in `lib/dispatch/constants.ts`. Defaults: 10-second SOS offers, 3 drivers per round, 3 rounds, 10 km search radius, 15-minute normal-request expiry, 3-second polling, 5-second GPS pings, 30-second stale-location threshold, 30-second route refresh, 200 m deviation threshold, and 30-day location retention. Fallback text is configurable and otherwise instructs patients to contact local emergency services.
- At the Phase 1 handoff, existing dispatch implementation was not yet wired to these constants; Phase 2 now uses the central offer, batch, round, radius, normal-expiry, and stale-location settings.
- Verification: `npm test -- --run` (35 tests), `npx tsc --noEmit`, and `npm run build` all pass.
- Phase 1 changed no UI or API behavior; Phase 2 integrates the model rules into the existing MongoDB collections and routes.

## Phase 2 implementation notes

- SOS `POST /api/sos` now requires `Idempotency-Key`, returns prior retries, and uses unique patient/key and active-patient indexes to close concurrent duplicate creation races. The existing SOS UI reuses its key through network retries.
- Driver dispatch offers the nearest eligible batch simultaneously, honors stale-location and busy-driver exclusions, uses the configured fixed radius/round/expiry values, records request and offer transition history, expires and reoffers offers, supersedes siblings after acceptance, and reaches `no_driver_found` after the last round.
- Driver acceptance keeps the conditional `findOneAndUpdate({_id, status: "searching"})` claim and conditional driver reservation. Only the request claim winner proceeds; a losing reservation is released. The Promise.all race test models this conditional claim; it does not connect to a live MongoDB replica set.
- Added normal transport creation at `POST /api/requests`, including idempotency, eligible-driver offers, destination/urgency/notes, and server expiry. The current booking form now submits to that endpoint without changing its layout.
- Added API aliases for driver feed/location/presence, patient active request, offer accept/decline, request cancellation, and trip status. Cancellation supports the owning patient or assigned driver and releases pending offers/driver reservation.
- Driver pre-acceptance offer data now contains a rounded approximate pickup area and omits patient name and phone. Exact location/contact details remain in the assigned-trip response after acceptance.
- Verification: `npm test -- --run` (38 tests), `npx tsc --noEmit`, and `npm run build` all pass. The new route handlers appear in the production route manifest.
- No dashboard layout work was done. Full database concurrency/authorization integration tests require a disposable test MongoDB and remain a verification limitation; Phase 3 is the next spec phase.

## Phase 3 implementation notes

- Reused the existing driver dashboard and its slate/sky/rose styling, adding Overview, Requests, Current Trip, and Task History tabs without introducing a new dashboard design.
- Kept the online toggle and location-sharing status visible across tabs. Normal transport offers appear only in Requests, include urgency, approximate distance, destination, and notes, and do not trigger SOS popups.
- SOS offer alerts use server time and the persisted offer expiration, display a countdown ring, and provide Accept/Decline actions from any tab. Expired offers are recorded through the existing offer transition log and surfaced as missed history entries. Local storage suppresses duplicate popups across same-user tabs; atomic server acceptance remains the final double-accept guard.
- Accepted trips switch to Current Trip, where the existing trip controls are paired with the live trip map, patient call link, ETA, and cancellation action. Completed and cancelled assigned trips and expired SOS offers are shown in Task History.
- Verification: `npx eslint` on the four changed dashboard/API files, `npx tsc --noEmit`, `npx vitest run` (38 tests), `npm run build`, and `git diff --check` pass. Live MongoDB and signed-in visual browser checks were not available in this session.

## Phase 4 implementation notes

- Removed the SOS confirmation step. A successfully created SOS now offers the configured five-second undo window; server idempotency still prevents duplicate records. The undo action cancels through the existing patient-owned cancellation route.
- If device GPS is blocked or unavailable, the SOS toast offers a pickup address field. A patient-authenticated route geocodes the address with the existing OpenStreetMap/Nominatim ecosystem and submits coordinates to the existing SOS dispatch path. Routine requests now geocode manually edited pickup addresses when GPS coordinates are absent.
- Expanded the dashboard's existing request panel into the current request timeline with driver contact/vehicle, ETA, stale location age, cancellation, destination, and live map after assignment. `GET /api/patient/active-request` now includes the latest active or terminal status and the configured fallback instruction for `no_driver_found`.
- Normal transport booking returns patients to the dashboard current-request panel after submit; assigned normal requests can also be cancelled from the history view. Removed the hardcoded emergency phone number and use the server-configured fallback text.
- Verification: targeted ESLint, `npx tsc --noEmit`, `npx vitest run` (38 tests), `npm run build`, and `git diff --check` pass. Live geocoding and authenticated visual checks need a running app/session and were not available here.

## Phase 5 implementation notes

- Replaced timer-based one-shot driver GPS reads with `watchPosition` at high accuracy. The watch runs while online and remains active during an accepted trip; it is cleared when offline or when the trip ends. Driver location status distinguishes sharing, blocked permission, unavailable, and off.
- Driver heartbeats now include accuracy, heading, and speed. The server updates the latest driver fix during an owned active trip even though the driver is no longer available for new requests. Trip pings are inserted only after both the configured interval and movement threshold, while every accepted GPS heartbeat updates freshness.
- Added the `driver_location_pings` collection with an `at` TTL index driven by `LOCATION_RETENTION_DAYS`; records include trip, driver, coordinates, accuracy, and timestamp. Tunable movement and maximum route-accuracy thresholds are centralized in `lib/dispatch/constants.ts`.
- MapView now keeps the driver marker and GPS accuracy circle across polling updates, animates marker transitions, fits bounds per trip instead of per poll, and exposes Recenter after pan. Route lookup is limited by `ROUTE_REFRESH_SECONDS` except when movement exceeds `ROUTE_DEVIATION_M`; poor GPS accuracy suppresses route drawing and displays a clear notice. A direct line is labeled approximate while road directions are unavailable.
- Both patient and driver trip maps receive the same server GPS data and trip identity. Patient ETA-change notice (>10 minutes) was already implemented in Phase 4 and remains active.
- Verification: targeted ESLint, `npx tsc --noEmit`, and `git diff --check` pass. Browser geolocation, routing service availability, Mongo TTL deletion, and two-account live-map checks need a running authenticated development environment and remain manual QA items.

## Functional gaps found for later phases

- Routine transport currently posts `requestType`, destination, schedule, and notes to `POST /api/sos`, but that handler only validates and persists the SOS fields (`location`, `incidentType`, and `requiredEquipment`). There is no distinct normal-request endpoint or driver Requests feed yet.
- SOS creation checks for an existing active request before inserting, but there is no idempotency key or unique active-SOS constraint. Concurrent taps/retries can pass the check together and create multiple active requests.
- The driver feed returns the full SOS pickup coordinates, name, and phone in pending-offer cards before a driver accepts. The spec requires rough area/distance before acceptance and exact pickup details after acceptance.
- Patient cancellation is implemented, but the current cancel route only authorizes the patient role; assigned-driver cancellation is not exposed.
- Candidate eligibility filters available drivers with a location, but does not enforce the spec's stale-location cutoff. Client GPS uses periodic `getCurrentPosition` calls rather than a `watchPosition` stream and persisted location-ping history.
- Offer acceptance uses a conditional request update, then marks competing offers as `taken`; concurrency behavior and rollback paths still need the Phase 2 concurrent-accept verification.
