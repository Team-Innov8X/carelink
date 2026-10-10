# Limitations and failure analysis

## Synthetic assumptions and placeholders

- All acceptance labels, profiles, rejection history, case experience, capacities, and replay episodes are synthetic. They are not measured operational performance.
- `data/conditions.json` is a placeholder owned by the product owner. Its condition/resource/capability/urgency mappings are not medically reviewed.
- `data/hospital-profiles.json` capabilities, capacities and handled-case counts are illustrative seed values. Production inventory and capability data must be verified.
- `walkInsLast30Min` is currently zero in production recommendation feature construction because a suitable production signal was not found. The model's training feature uses simulator arrivals, so the production feature distribution can differ.
- The fallback instruction is generic and must be replaced with region-specific emergency services text and contacts.

## Observed failure

The one-shot 300-episode proxy replay found a concrete slower model-aware outcome: `45:major_trauma:21`. The nearest feasible option accepted at 44 minutes. The model-aware ordering first tried a hospital whose ground-truth simulated response rejected, then confirmed at the same hospital at 84 minutes. Overall first-choice acceptance was 70.33% for model-aware versus 70.67% for nearest; mean confirmation time was 25.98 versus 25.85 minutes. No tuning was performed from this holdout result. The replay is an abstract acceptance-routing proxy, not a complete production replay.

## Evaluation boundaries

- The acceptance model beat the hard 0/1 baseline on synthetic test Brier score; that does not establish calibration or performance on real hospitals.
- The replay's availability predictor and ledger behavior do not reproduce full production resource contention. Its incompatible/double-count counters are zero by construction and should not be read as production invariant proof.
- API authorization and timeout routes compile, but no Mongo-backed integration tests were available for 403, deadline races, idempotency, or two-patient last-bed concurrency.
- Responsive screenshots/visual checks at 375px, 768px and 1280px, keyboard navigation, focus visibility, contrast, and screen-reader testing remain undone. See `docs/REC_UI_AUDIT.md`.
- Hospital-specific accepted arrival ETA presentation and driver-side exhausted-hospital manual fallback need additional product/integration validation.
- The method is greedy, not globally optimal. Probabilities and simulated case experience are explanations to support human choice, not medical advice, survival odds, or guarantees.

## Required product-owner inputs

1. Approve/revise conditions, labels, severity, resource types and capability mappings in `data/conditions.json` with qualified clinical review.
2. Supply authoritative hospital identifiers, current capacity, open/closed state, capability tags and verified contact details.
3. Confirm deployment values: maximum travel time, reroute count, rejection penalty, and hospital response timeout.
4. Replace `EMERGENCY_FALLBACK_TEXT` with locally appropriate emergency service instruction and phone number.
5. Confirm which production systems provide past-hour hospital rejection and last-30-minute walk-in signals; until then the production acceptance features include a zero walk-in value.
6. Provide/assign hospital staff accounts and verify each account is linked to the correct hospital.

The application should not present the placeholder mappings or synthetic metrics as approved real-world guidance before those inputs and the outstanding integration/browser checks are complete.
