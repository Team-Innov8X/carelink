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

## Functional gaps found for later phases

- Routine transport currently posts `requestType`, destination, schedule, and notes to `POST /api/sos`, but that handler only validates and persists the SOS fields (`location`, `incidentType`, and `requiredEquipment`). There is no distinct normal-request endpoint or driver Requests feed yet.
- SOS creation checks for an existing active request before inserting, but there is no idempotency key or unique active-SOS constraint. Concurrent taps/retries can pass the check together and create multiple active requests.
- The driver feed returns the full SOS pickup coordinates, name, and phone in pending-offer cards before a driver accepts. The spec requires rough area/distance before acceptance and exact pickup details after acceptance.
- Patient cancellation is implemented, but the current cancel route only authorizes the patient role; assigned-driver cancellation is not exposed.
- Candidate eligibility filters available drivers with a location, but does not enforce the spec's stale-location cutoff. Client GPS uses periodic `getCurrentPosition` calls rather than a `watchPosition` stream and persisted location-ping history.
- Offer acceptance uses a conditional request update, then marks competing offers as `taken`; concurrency behavior and rollback paths still need the Phase 2 concurrent-accept verification.
