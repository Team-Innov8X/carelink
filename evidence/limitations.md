# Limitations

## Known before the frozen test evaluation

- All worlds, admissions, and outcomes are synthetic. Results describe the declared generator only and are not real-world accuracy estimates.
- A preliminary generator-calibration pass inspected all splits for an earlier seed before the holdout boundary was enforced. The committed dataset uses the fresh seed 20261011; the final calibration report uses days 1–40 only, and no model or model-selection result was obtained from the earlier exploratory test labels. The test model evaluation is still performed once after the freeze, but generator parameters were informed by that exploratory calibration pass.
- The stay-duration distribution is estimated from stays admitted and discharged within training days 1–30. This excludes censored/longer stays and can bias expected-release estimates downward or toward shorter stays.
- The model improves validation Brier score, while the hard baseline currently has slightly higher accuracy at a 0.5 threshold. Probabilities and thresholded classification answer different questions; this trade-off should remain visible in results.

## Test-run case review

To be completed after the single frozen test evaluation and replay analysis.
