# HLTH02 replay evaluation (test)

Episodes: 300; days 41–50; episode seed 20261020. Both methods replayed identical episode and event draws.

| Metric | Baseline | Model-aware |
|---|---:|---:|
| Handover success on first choice | 55.46% | 55.51% |
| Reroutes per patient | 0.113 | 0.113 |
| Mean time to handover (min) | 31.95 | 31.95 |
| 90th percentile time (min) | 55 | 55 |
| Unserved | 1515 | 1513 |
| Urgency-1 failure rate | 31.74% | 31.91% |
| Incompatible allocations | 0 | 0 |
| Double-counted reservations | 0 | 0 |

Unserved reasons: baseline `{"capacity_exhausted":682,"displaced_by_higher_priority":719,"travel_time_limit":114}`; model-aware `{"capacity_exhausted":681,"displaced_by_higher_priority":718,"travel_time_limit":114}`.

Paired episode-bootstrap 95% CIs for model-aware minus baseline: success {"estimate":0.0004112554112554117,"lower95":-0.0006060606060606055,"upper95":0.001428571428571429,"resamples":2000,"seed":20261013}; reroutes {"estimate":-0.00010529285529285532,"lower95":-0.0016556776556776553,"upper95":0.0015100270100270102,"resamples":2000,"seed":20261015}; mean time {"estimate":-0.050500407000406956,"lower95":-0.18510927960927961,"upper95":0.06269291819291828,"resamples":2000,"seed":20261014}.

Log loss is not a fair comparison because the baseline outputs hard 0/1 probabilities.
