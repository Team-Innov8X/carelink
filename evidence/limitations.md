# Limitations

## Known before the frozen test evaluation

- All worlds, admissions, and outcomes are synthetic. Results describe the declared generator only and are not real-world accuracy estimates.
- A preliminary generator-calibration pass inspected all splits for an earlier seed before the holdout boundary was enforced. The committed dataset uses the fresh seed 20261011; the final calibration report uses days 1–40 only, and no model or model-selection result was obtained from the earlier exploratory test labels. The test model evaluation is still performed once after the freeze, but generator parameters were informed by that exploratory calibration pass.
- The stay-duration distribution is estimated from stays admitted and discharged within training days 1–30. This excludes censored/longer stays and can bias expected-release estimates downward or toward shorter stays.
- The model improves validation Brier score, while the hard baseline currently has slightly higher accuracy at a 0.5 threshold. Probabilities and thresholded classification answer different questions; this trade-off should remain visible in results.

## Frozen test evaluation (days 41–50)

After tagging `hlth02-pre-test` at commit `698b652`, the test split was scored once on 2,400 samples. Model Brier was 0.0738 versus 0.0933 for baseline; the paired 1,000-resample 95% interval for model-minus-baseline Brier was [-0.0259, -0.0131]. The 10-bin calibration table is recorded in `model/metrics.json` under `test.model.calibration10Bins` and `test.baseline.calibration10Bins`. Accuracy was 0.899 versus 0.907; the baseline's slightly higher threshold accuracy remains a trade-off. Log loss was 0.2443 versus 3.2236, but that is not a fair comparison because the baseline outputs hard 0/1 probabilities.

This post-test edit records the test output and trade-off only. Model weights, features, generator parameters, selected lambda, and tuning decisions were not changed after the test result.

## Test-run case review

The one-shot replay review selected test-day-49-episode-2: baseline handover success 90.9%, model-aware 81.8%. This episode's complete patient outcomes and event logs are preserved in results.json under caseReview. Model-aware success was 9/11 patients versus 10/11 baseline. This synthetic case is an observed failure/trade-off, not evidence of real-world performance. The six S1–S6 JSONL files are deterministic scenario demonstrations generated from validation days 31–40; they are demonstrations, separate from the 300-episode test evaluation.

## Additional disclosures for the evidence package

- **Held-out replay result:** There was no detectable benefit from the model-aware policy on the held-out test replay. The measured reservation safety checks had no regressions: `incompatible_allocations` and `double_counted_reservations` were both 0 for both methods. The urgency-1 failure rate was slightly higher with model-aware allocation: 31.91% versus 31.74% for baseline. The paired confidence intervals for the reported workflow differences include zero.
- **Post-result reporting change:** Inspection of `git diff 0af9a4a de86bda -- sim/train.ts sim/metrics.ts sim/test-model.ts model/metrics.json` shows that `sim/train.ts` added a guard against training after a test evaluation exists and changed the report layout to lead with validation Brier/calibration, followed by accuracy and log loss with a hard-0/1-baseline caveat; `sim/metrics.ts` reordered metric fields so calibration precedes accuracy and log loss; `sim/test-model.ts` added `testEvaluation` and `logLossComparisonNote` metadata and led its output with calibration; and `model/metrics.json` updated the `testEvaluation` description, reordered the existing numeric fields, and added the log-loss caveat. The diff changed reporting and formatting only: metric values were not changed. Model weights, features, and the generator were unchanged.
- **Scenario source:** The S1–S6 demonstration inputs are derived from validation days 31–40, not the held-out test split.
- **Skipped live integration:** The live `POST /api/allocate-batch` endpoint was skipped. It was the first item on the specification's cut list; the app demonstration uses the simulation engine and ledger.
- **Synthetic data:** All numbers come from synthetic data and describe behavior under the declared generator and simulation assumptions. They do not establish real-world accuracy or operational performance.
- **Allocation optimality:** The engine uses greedy allocation in urgency order. It is not globally optimal and does not search all joint assignments.
- **Evaluation rerun constraint:** The requested bare `npm run eval` command was executed and exited before reading data because `sim/evaluate.ts` requires an explicit `--split validation` or `--split test`. Replaying the held-out test would violate its one-shot guard, while a validation run writes validation result files. To keep this phase documentation-only and preserve existing results, no split-specific replay was run and no result file was overwritten. The checked-in `evidence/results.md` and `evidence/results.json` remain the recorded test results.
