# Phase 0 setup

START_COMMIT: 095c8ec2da0b2576ced1c0cd9659a0ed12269a83

Branch: `hlth02`
Start tag: `hlth02-start`

## Existing code to reuse

- `lib/ranking.ts`: existing hospital ranking based on available resource categories, travel time, data freshness, availability, and active/busy status. Phase 3 should call or adapt this for resource/capability feasibility and ranking instead of creating a second matching implementation. The simulator still needs its own explicit `icu_bed` and `emergency_bed` semantics.
- `lib/services/hold-service.ts`: existing MongoDB hold workflow. `createHold()` uses a transaction and an atomic resource claim against available quantity minus held quantity; it inserts a pending hold. Confirmation, rejection, release, and expiry operations already exist. The simulation ledger can remain in-memory and deterministic; any live integration should reuse this service.
- `lib/models/hold.ts`: existing hold statuses and patient details. `pending` is the closest existing equivalent to the spec's `requested`; the existing model does not include every simulation-only transition.
- `lib/models/hospital.ts` and `lib/models/resource.ts`: existing hospital and resource persistence models. The simulation's four-hospital world should use separate typed fixtures rather than changing production persistence semantics.

## Phase 3 allocation foundation

- The allocation engine and ledger use `lib/allocation/types.ts` simulation types only. `production-adapter.ts` is the boundary to the live service: `icu_bed` maps to production `type: "bed", category: "icu"`, `emergency_bed` maps to `type: "bed", category: "emergency"`, simulation urgency maps to `critical` / `urgent` / `standard`, and simulation `requested` maps to the existing service's `pending` hold.
- `lib/services/hold-service.ts` now accepts an optional `patientId` so the adapter can retain the engine's patient identity in the production hold record. The adapter delegates atomic claims to `createHold()`; no live holds are created by the simulation engine.
- Allocation policy values are in `lib/allocation/constants.ts` and are fixed before any allocation test-day replay. Development and fuzz testing use in-memory fixtures with seed `20261013`; no test-day split data is used.
- `tests/allocation-ledger-fuzz.test.ts` checks I1–I6 after each of 20,000 events across 1,000 fixed-seed sequences. `tests/allocation-engine.test.ts` covers capacity contention, urgency order, capability feasibility, forecast fallback, and idempotency.

## Later implementation and evidence commits

- `b79ee9234ed73dccb846a375ffd4b6a314d5ab87` — `hlth02: implement replay evaluation`; tagged `hlth02-eval-freeze` before the one-shot test evaluation.
- `b5538efa3cfca9fd134bda328889aa87eab26e00` — `hlth02: record replay evaluation results`.
- `942835170bcc08e767398c591deca253a44fe767` — `hlth02: add deterministic scenario replay logs`.
- `cb3de711db42e86107bbe769fc65f5409b6adf1d` — `hlth02: add scenario replay demo`.
- `bfca948773ca99a6619b8ae69f087b3ba43268b8` — `hlth02: document evidence package`; this is the final repository commit before Phase 6 part 2 documentation.

## Phase 0 tooling

Added `tsx` and `vitest` as development dependencies and scripts for `gen-data`, `train`, `eval`, and `test`. Existing `dev` script remains `next dev`.
