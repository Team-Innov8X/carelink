# Recommendation feature commits

- `START_COMMIT`: `5b1bca4f8b5a922daa12a9f71825ad73d836c809`
- Branch: `rec-feature`
- `rec-start`: Phase 0 audit baseline.

## Existing work to reuse

- HLTH02 hard allocation constraints and ordering: `lib/allocation/engine.ts` (`allocateBatch`, `replan`), `lib/allocation/ledger.ts` (reservation transitions and invariants I1–I6), `lib/allocation/forecaster.ts`, `lib/allocation/baseline.ts`, and `lib/ranking.ts`.
- HLTH02 synthetic availability generator, seeded split, TypeScript logistic training, parity and replay: `sim/world.ts`, `sim/features.ts`, `sim/train.ts`, `sim/metrics.ts`, `sim/replay.ts`, and `data/synthetic/` / `model/` artifacts. Acceptance behavior is not yet modeled with decision-time features; the replay currently compares a fixed hospital rejection rate.
- Production bed reservation and hospital request flows: `lib/services/hold-service.ts`, `lib/sos.ts`, `app/api/holds/`, `app/api/hospital-requests/`, `components/hospitalStaff/HospitalRequestInbox.tsx`, and `lib/hospital-reservations.ts`.
- Driver trip state, ownership and polling: `lib/dispatch/state-machine.ts`, `app/api/trips/[id]/status/route.ts`, `components/driver/LiveSOSRequests.tsx`, and `components/sos/PatientSOSStatus.tsx`.
- Better Auth roles and access helpers: `lib/roles.ts`, `lib/auth-utils.ts`, `lib/role-route.ts`. Hospital roles already exist (`hospital`, `hospital_staff`).
- Map and locations: `components/common/MapView.tsx`, `lib/sos.ts`, `app/api/driver/location/route.ts`.
- Reuse the existing hold ledger in production where it represents a real request; recommendation-simulator reservations remain a replay artifact unless they can be mapped without weakening existing inventory invariants.

## Phase records

| Phase | Commit | Notes |
|---|---|---|
| 0 | `7acb8fdffaf406952e055ff5bbf05a3956b904f1` | Audit and setup; tag `rec-start` |
| 1 | `f94ba5a3fb723c1ec1c3854a6c5fe43b4716a94f` | Placeholder condition config, synthetic profiles, acceptance simulator/data and assumptions |
| 2 | `951d2b29527ab320eed6994b2dc8fff13177a91a` | Custom L2 logistic model frozen as `rec-pre-test`; one-shot test report: `evidence/rec/accept-test-evaluated.json` |
| 2 evidence | `e99dd9f14c71a76f31d69c5acc6297849e778166` | Acceptance holdout metrics and prediction evidence recorded |
| 3 | `3aecfc4f4977d2c32cd56fab460e38776fa39f8a` | Feasibility-first ranking, model fallbacks, override validation and seeded engine checks |
| 4 | `1f89c03b793347eecf946c9ee9f604b6d56f9d27` | Recommendation, response, timeout and patient/driver APIs connected to holds |
| 5 | `e765a9ef3693ec1f906e5ba51f960264df1a91ad` | Driver, patient and hospital recommendation workflow views |

The final implementation and evidence package is committed after phases 6–7. The working branch is `rec-feature`; the product spec supplied by the user is intentionally untracked and excluded from commits.


| 3 | pending | Feasibility-first ranking, override validation, fallback flags and seeded engine checks |
| 6 | pending | One-shot 300-episode frozen-test recommendation replay and H1-H7 simulation page |
