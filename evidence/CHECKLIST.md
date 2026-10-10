# HLTH02 requirements and demonstrations checklist

This checklist maps the requirements in `HLTH02_BUILD_SPEC.md` to repository artifacts. Test names below are the exact Vitest descriptions.

## Requirements R1–R6

| Requirement | Evidence |
|---|---|
| **R1 — Allocate batches using urgency, resource requirement, travel time, and confirmed capacity.** | `lib/allocation/engine.ts` (`allocateBatch`); `lib/allocation/constants.ts`; `tests/allocation-engine.test.ts` — `allocates the constrained unit to higher urgency first and reports remaining capacity`, `uses the existing ranking feasibility matcher and never downgrades resource or capability`, and `chooses the lower travel-plus-forecast cost and falls back on invalid forecasts`. |
| **R2 — Keep reservations valid under simultaneous requests and replan after operational changes.** | `lib/allocation/ledger.ts`, `lib/allocation/engine.ts` (`replan`), and `lib/allocation/production-adapter.ts`; `tests/allocation-engine.test.ts` — `replans a rejected patient only and preserves other confirmed reservations deeply`, `replans only the patient whose confirmed unit was lost`, `returns no changes for an ETA update of 10 minutes and replans above the threshold`, `lets exactly one of two patients racing for the final unit win with a reason for the other`, and `marks a lower-urgency patient displaced by a higher-priority patient`; `tests/allocation-ledger-fuzz.test.ts` — `runs 1,000 seeded event sequences and checks I1–I6 after every event`. |
| **R3 — Return a reason for every unserved patient and prevent incompatible or double-counted allocations.** | `lib/allocation/types.ts` (exact reason-code union), `lib/allocation/engine.ts`, `lib/allocation/ledger.ts`; `tests/allocation-engine.test.ts` — `returns no_compatible_resource when no hospital supports the requested bed type`, `uses the existing ranking feasibility matcher and never downgrades resource or capability`, `reports hospitals_closed when the only compatible hospital closes`, `reports capacity_exhausted without downgrading an ICU request to emergency bed`, `reports rejected_no_alternative after a rejection with no other hospital`, `marks handover_failed after two arrival failures`, and `returns travel_time_limit when all compatible hospitals exceed the patient's limit`; `evidence/results.md` records zero incompatible allocations and zero double-counted reservations in the test replay. |
| **R4 — Estimate availability at arrival from decision-time information.** | `sim/features.ts`, `lib/allocation/forecaster.ts`, `model/model.json`, `model/metrics.json`; `tests/features.test.ts` — `uses elapsed stays and the training survival distribution only` and `returns zero when no current patients or no training durations are available`; `tests/forecaster-parity.test.ts` — `matches the training probabilities for 20 saved validation vectors`. |
| **R5 — Use probability only to rank feasible options; hard capacity and closure rules remain authoritative.** | `lib/allocation/engine.ts`, `lib/allocation/ledger.ts`, `lib/allocation/baseline.ts`; `tests/allocation-engine.test.ts` — `chooses the lower travel-plus-forecast cost and falls back on invalid forecasts`, `uses the existing ranking feasibility matcher and never downgrades resource or capability`, `reports capacity_exhausted without downgrading an ICU request to emergency bed`, and `reports hospitals_closed when the only compatible hospital closes`. |
| **R6 — Compare predictor and allocation workflow with a current-capacity baseline on identical replay inputs.** | `sim/replay.ts`, `sim/evaluate.ts`, `evidence/results.json`, and `evidence/results.md` (300 paired test episodes, fixed episode seed, paired bootstrap intervals); `model/metrics.json` (sample-level Brier and calibration comparison). |

## Required demonstrations

| Demonstration | Scenario artifact | Test evidence |
|---|---|---|
| Patient surge | `data/scenarios/S2.json`; replay `evidence/replay-logs/S2.jsonl` | `tests/scenarios.test.ts` — `keeps the surge scenario on ICU and leaves patients unserved when capacity is short`; `tests/allocation-engine.test.ts` — `allocates the constrained unit to higher urgency first and reports remaining capacity`. |
| Hospital rejection | `data/scenarios/S3.json`; replay `evidence/replay-logs/S3.jsonl` | `tests/scenarios.test.ts` — `includes rejection, resource loss, duplicate idempotency and fallback closure cases`; `tests/allocation-engine.test.ts` — `replans a rejected patient only and preserves other confirmed reservations deeply`. |
| Availability change during travel | `data/scenarios/S4.json`; replay `evidence/replay-logs/S4.jsonl` | `tests/scenarios.test.ts` — `includes rejection, resource loss, duplicate idempotency and fallback closure cases`; `tests/allocation-engine.test.ts` — `replans only the patient whose confirmed unit was lost`. |
| Insufficient capacity, with no resource downgrade | `data/scenarios/S2.json`; replay `evidence/replay-logs/S2.jsonl` | `tests/scenarios.test.ts` — `keeps the surge scenario on ICU and leaves patients unserved when capacity is short`; `tests/allocation-engine.test.ts` — `reports capacity_exhausted without downgrading an ICU request to emergency bed`. |
| Duplicate or simultaneous reservation attempts | `data/scenarios/S5.json`; replay `evidence/replay-logs/S5.jsonl` | `tests/scenarios.test.ts` — `includes rejection, resource loss, duplicate idempotency and fallback closure cases`; `tests/allocation-engine.test.ts` — `prevents duplicate patient reservations across hospitals` and `lets exactly one of two patients racing for the final unit win with a reason for the other`. |

## End-to-end scenarios S1–S6

| Scenario | Scenario file and replay log | Test evidence |
|---|---|---|
| **S1 — Normal operation** | `data/scenarios/S1.json`; `evidence/replay-logs/S1.jsonl` | `tests/scenarios.test.ts` — `serves all four patients in normal operation`. |
| **S2 — Surge and insufficient ICU capacity** | `data/scenarios/S2.json`; `evidence/replay-logs/S2.jsonl` | `tests/scenarios.test.ts` — `keeps the surge scenario on ICU and leaves patients unserved when capacity is short`. |
| **S3 — Hospital rejection** | `data/scenarios/S3.json`; `evidence/replay-logs/S3.jsonl` | `tests/scenarios.test.ts` — `includes rejection, resource loss, duplicate idempotency and fallback closure cases`; `tests/allocation-engine.test.ts` — `replans a rejected patient only and preserves other confirmed reservations deeply`. |
| **S4 — Availability change during travel** | `data/scenarios/S4.json`; `evidence/replay-logs/S4.jsonl` | `tests/scenarios.test.ts` — `includes rejection, resource loss, duplicate idempotency and fallback closure cases`; `tests/allocation-engine.test.ts` — `replans only the patient whose confirmed unit was lost`. |
| **S5 — Duplicate and simultaneous attempts** | `data/scenarios/S5.json`; `evidence/replay-logs/S5.jsonl` | `tests/scenarios.test.ts` — `includes rejection, resource loss, duplicate idempotency and fallback closure cases`; `tests/allocation-engine.test.ts` — `prevents duplicate patient reservations across hospitals` and `lets exactly one of two patients racing for the final unit win with a reason for the other`. |
| **S6 — Forecaster fallback and hospital closure** | `data/scenarios/S6.json`; `evidence/replay-logs/S6.jsonl` | `tests/scenarios.test.ts` — `includes rejection, resource loss, duplicate idempotency and fallback closure cases`; `tests/allocation-engine.test.ts` — `chooses the lower travel-plus-forecast cost and falls back on invalid forecasts` and `reports hospitals_closed when the only compatible hospital closes`. |

## Additional verification artifacts

- Independent all-50-day ground-truth label verification: `tests/labels.independent.test.ts` — `re-derives every sample label from the raw free-unit timeline`.
- Chronological 1–30 / 31–40 / 41–50 split verification: `tests/world.test.ts` — `uses chronological day boundaries for every split`.
- Test limitations and failure review: `evidence/limitations.md`.
- Public simulation UI: `app/surge-demo/page.tsx` and `app/surge-demo/scenario-demo.tsx`.
