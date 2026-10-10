# HLTH02 replay evaluation (validation)

Episodes: 300; days 31–40; episode seed 20261020. Both methods replayed identical episode and event draws.

| Metric | Baseline | Model-aware |
|---|---:|---:|
| Handover success on first choice | 56.04% | 56.30% |
| Reroutes per patient | 0.112 | 0.111 |
| Mean time to handover (min) | 31.86 | 31.88 |
| 90th percentile time (min) | 55 | 55 |
| Unserved | 1484 | 1475 |
| Urgency-1 failure rate | 32.35% | 31.30% |
| Incompatible allocations | 0 | 0 |
| Double-counted reservations | 0 | 0 |

Unserved reasons: baseline `{"capacity_exhausted":707,"displaced_by_higher_priority":663,"travel_time_limit":114}`; model-aware `{"capacity_exhausted":699,"displaced_by_higher_priority":662,"travel_time_limit":114}`.

Paired episode-bootstrap 95% CIs for model-aware minus baseline: success {"estimate":0.002466080216080215,"lower95":-0.00021212121212121237,"upper95":0.005209346209346208,"resamples":2000,"seed":20261013}; reroutes {"estimate":-0.0008486790986790987,"lower95":-0.0033425925925925928,"upper95":0.0016947681947681948,"resamples":2000,"seed":20261015}; mean time {"estimate":0.030079365079365074,"lower95":-0.09087758537758535,"upper95":0.17399434824434826,"resamples":2000,"seed":20261014}.

Log loss is not a fair comparison because the baseline outputs hard 0/1 probabilities.
