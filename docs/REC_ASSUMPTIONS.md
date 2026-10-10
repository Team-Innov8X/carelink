# Hospital recommendation assumptions

All hospital response, case-experience, capability and occupancy data in this feature are synthetic. The condition mappings in `data/conditions.json` and hospital profiles in `data/hospital-profiles.json` are placeholders for product-owner review and are not medically validated.

## Reproduction and split

- Acceptance generator: `sim/acceptance-world.ts`; data command: `npm run rec-gen-data`.
- Seed: `20261011` (override with `REC_SEED`); RNG: existing seeded Mulberry32 implementation in `sim/world.ts`.
- Simulated days: 50. Training days 1–30, validation days 31–40, test days 41–50.
- Each hospital/condition has 16 decision observations per day, sampled during hours 6–21.
- The simulator's ground truth rejection rate is clamped to 5%–40% for each decision. It combines the hospital's declared synthetic rejection rate, occupancy pressure above 65%, hidden active surge, hidden closure within 90 minutes, capability mismatch, and recent past-hour simulated rejection rate.
- The model sees only the feature vector declared in `ACCEPTANCE_FEATURE_ORDER`: current free beds, occupancy ratio, past-hour rejection rate, previous 30-minute arrivals, urgency, condition one-hot values, capability match, ETA, capacity, hour sine/cosine, and weekend indicator. It never sees the hidden surge or closure flags or the ground-truth draw/probability.
- Hospital capacity, capability tags and `casesHandled` volumes are simulation seed data. Case counts only support the plainly labeled simulated experience display.

## Scoring and operational defaults

Every allocation must first pass existing resource, capability, open, current confirmed free capacity and travel-limit constraints. Among feasible options, the recommendation cost is `travel_min + (1 - p_available) * 25 + (1 - p_accept) * 20 - 3 * experience_score`. `experience_score` is `min(1, casesHandled / 100)`. Ties break by hospital id. This greedy choice is not globally optimal.

Defaults live in `lib/recommend/constants.ts`: maximum travel 60 minutes, reroute penalty 25 minutes, rejection penalty 20 minutes, experience bonus 3 minutes, maximum two reroutes, and hospital response timeout 90 seconds. Fallback text is an unconfigured generic operational suggestion and must be replaced for the deployment region.

Acceptance training and runtime ranking are decision support only. The model cannot override capacity, closure, resource type, capability, or driver choice. The driver remains responsible for the destination decision.
