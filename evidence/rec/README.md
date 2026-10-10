# Hospital recommendation evidence package

## Source state and changes

- Start commit: `5b1bca4f8b5a922daa12a9f71825ad73d836c809`.
- Freeze commit/tag: `951d2b29527ab320eed6994b2dc8fff13177a91a` / `rec-pre-test`.
- Feature branch: `rec-feature`; phase commits are recorded in `docs/REC_COMMITS.md`.
- Feature: condition-based ranking, existing-ledger bed holds, hospital response and timeout rerouting, driver override, shared patient/driver status, synthetic acceptance model, and `/hospital-demo`.

## Reproduction and data

The simulator and every acceptance label are synthetic. No real hospital decisions, patient outcomes or clinical datasets were used. `data/conditions.json` and `data/hospital-profiles.json` are product-owner placeholders. Synthetic seeds, hidden signals, split boundaries and formula are documented in `docs/REC_ASSUMPTIONS.md`; source schemas are in `sim/acceptance-world.ts`. Labels are derived from the simulator's ground-truth draw and rejection probability, then independently re-derived by `deriveAcceptanceLabel`; the test report records `independentLabelsMatched: true`.

Training was a custom L2 logistic regression implemented in TypeScript (`sim/train-acceptance.ts`, runtime `lib/recommend/accept-model.ts`), with no pretrained model or external ML API. Training uses days 1–30; validation/tuning uses days 31–40; test uses days 41–50. Runtime parity was checked on 20 saved vectors (zero error). Acceptance holdout metrics are in `accept-test-evaluated.json`, model weights in `../../model/accept-model.json`, metrics in `../../model/accept-metrics.json`, and predictions in `../../model/accept-predictions.csv`.

The acceptance test evaluation was run once from the exact freeze commit. It evaluated 1,920 observations (1,580 accepted, 340 rejected). Brier: model `0.14334`, nearest-feasible hard 0/1 baseline `0.17708`; paired difference model minus baseline `-0.03374`, 95% CI `[-0.04025, -0.02714]`, 1,000 resamples, seed `20261021`. The baseline's log loss is not comparable because it emits hard 0/1 predictions.

The ranking cost is `travel_min + (1 - p_available) * 25 + (1 - p_accept) * 20 - 3 * experience_score`, where `experience_score = min(1, casesHandled / 100)`. The feasibility filter uses existing resource, capability, open/closed, free capacity after reservations, rejection exclusions and travel limit constraints first. Fallback flags are `forecast_fallback` and `accept_model_fallback`. Ranking is greedy and not globally optimal.

## Recommendation replay

`recommendation-replay.json` is a separate one-shot 300-episode proxy replay over days 41–50. It groups frozen synthetic hospital decisions by day, condition and hour; eligibility is positive simulated free beds and capability match. The nearest baseline orders by ETA; the model-aware ordering uses ETA plus configured expected rejection penalty, then walks options using the recorded ground-truth response outcomes with a maximum of two reroutes. The replay used the same episodes for both methods.

| Measure | Nearest feasible | Model-aware |
|---|---:|---:|
| First-choice acceptance | 70.67% | 70.33% |
| Mean reroutes | 0.0867 | 0.0900 |
| Mean minutes to confirmed hospital | 25.85 | 25.98 |
| Urgency-1 failures | 60 | 60 |
| Incompatible allocation counter | 0 | 0 |
| Double-counted reservation counter | 0 | 0 |

Both methods had the same confirmed/unserved rate in this proxy (paired difference 0, 95% interval [0, 0]). That interval is for confirmed-vs-unserved rate, not Brier score. The counters are necessarily zero for a single-request episode and do not establish safety under production concurrency. The replay does not model full availability forecasting, real route geometry, production ledger contention or real response-time distributions.

The demonstrated worse case was episode `45:major_trauma:21`: nearest feasible accepted on its first choice at 44 minutes; model-aware tried a rejected first choice then confirmed at the same hospital at 84 minutes. The model's probability ordering can therefore increase delay even when it eventually selects the same destination.

## Scenario and commands

H1–H7 scenario descriptions are `data/scenarios/H1.json` through `H7.json`; the page is `/hospital-demo`. These are workflow walkthroughs, not live integration test results. Relevant commands already run for this implementation:

- `npm test` — 46 tests passed across 12 files.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed with Next.js 16.3.5.
- `npm run rec-replay` — run once; `evidence/rec/.recommendation-replay.lock` prevents a second run.

Do not rerun `npm run rec-eval` or `npm run rec-replay`; their lock files preserve the one-shot holdout evaluations. To start a new experiment, create a separate branch and new immutable data/evaluation artifacts rather than overwriting this evidence.

## Operational note

This feature is decision support only. A driver may override a recommendation when the chosen hospital remains feasible and provides a reason. Medical decisions stay with the driver and hospital staff. No survival probability or guarantee is produced.
