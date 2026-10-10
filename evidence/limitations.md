# Limitations

## Known before the frozen test evaluation

- All worlds, admissions, and outcomes are synthetic. Results describe the declared generator only and are not real-world accuracy estimates.
- A preliminary generator-calibration pass inspected all splits for an earlier seed before the holdout boundary was enforced. The committed dataset uses the fresh seed 20261011; the final calibration report uses days 1–40 only, and no model or model-selection result was obtained from the earlier exploratory test labels. The test model evaluation is still performed once after the freeze, but generator parameters were informed by that exploratory calibration pass.
- The stay-duration distribution is estimated from stays admitted and discharged within training days 1–30. This excludes censored/longer stays and can bias expected-release estimates downward or toward shorter stays.
- The model improves validation Brier score, while the hard baseline currently has slightly higher accuracy at a 0.5 threshold. Probabilities and thresholded classification answer different questions; this trade-off should remain visible in results.

## Frozen test evaluation (days 41–50)

After tagging `hlth02-pre-test` at commit `698b652`, the test split was scored once on 2,400 samples. Model Brier was 0.0738 versus 0.0933 for baseline; the paired 1,000-resample 95% interval for model-minus-baseline Brier was [-0.0259, -0.0131]. Model log loss was 0.2443 versus 3.2236; accuracy was 0.899 versus 0.907. The baseline's slightly higher threshold accuracy remains a trade-off.

This post-test edit records the test output and trade-off only. Model weights, features, generator parameters, selected lambda, and tuning decisions were not changed after the test result.

## Test-run case review

To be completed after the replay analysis.
