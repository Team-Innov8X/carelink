# Phase 0 setup

START_COMMIT: 095c8ec2da0b2576ced1c0cd9659a0ed12269a83

Branch: `hlth02`
Start tag: `hlth02-start`

## Existing code to reuse

- `lib/ranking.ts`: existing hospital ranking based on available resource categories, travel time, data freshness, availability, and active/busy status. Phase 3 should call or adapt this for resource/capability feasibility and ranking instead of creating a second matching implementation. The simulator still needs its own explicit `icu_bed` and `emergency_bed` semantics.
- `lib/services/hold-service.ts`: existing MongoDB hold workflow. `createHold()` uses a transaction and an atomic resource claim against available quantity minus held quantity; it inserts a pending hold. Confirmation, rejection, release, and expiry operations already exist. The simulation ledger can remain in-memory and deterministic; any live integration should reuse this service.
- `lib/models/hold.ts`: existing hold statuses and patient details. `pending` is the closest existing equivalent to the spec's `requested`; the existing model does not include every simulation-only transition.
- `lib/models/hospital.ts` and `lib/models/resource.ts`: existing hospital and resource persistence models. The simulation's four-hospital world should use separate typed fixtures rather than changing production persistence semantics.

## Phase 0 tooling

Added `tsx` and `vitest` as development dependencies and scripts for `gen-data`, `train`, `eval`, and `test`. Existing `dev` script remains `next dev`.
