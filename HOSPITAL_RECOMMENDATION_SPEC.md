# HOSPITAL_RECOMMENDATION_SPEC.md — Condition-based hospital recommendation, automatic bed request, rejection re-routing

You are a coding agent extending an existing app (CareLink: Next.js App Router + TypeScript, MongoDB, Better Auth, Tailwind). This file is self-contained and builds on two earlier pieces of work already in the repo:

1. **HLTH02** (branch `hlth02`): allocation engine (`lib/allocation/engine.ts`), reservation ledger (`ledger.ts`), availability forecaster (`forecaster.ts`, `model/model.json`), simulator (`sim/`), replay and evaluation, `/surge-demo`.
2. **Driver/SOS workflow** (`DRIVER_SOS_WORKFLOW_SPEC.md`, commit prefix `drv:`): SOS and normal requests, driver dashboard, patient Current Emergency Request panel, GPS tracking, map.

Work **one phase at a time**, run the tests, commit with the prefix `rec:`, then **stop and report** before starting the next phase.

The product owner is not an ML specialist. Keep code simple, readable, and commented. Prefer boring and correct over clever.

---

## 0. Rules that apply everywhere

1. **Decision support, not a guarantee.** Never display or imply "will save the patient's life", "guaranteed", or a survival probability. There is no real outcome data. The UI says **"Recommended hospital (decision support)"**, shows the reasons, and the **driver can always override**. The medical decision stays with the driver and hospital staff.
2. **Hard rules always win.** A model may only rank hospitals that are already feasible. It may never create capacity or override a closure, an existing reservation, a capability mismatch, or a resource-type requirement. Reuse the HLTH02 hard constraints and ledger invariants I1–I6 unchanged. No downgrades, ever.
3. **Reuse, don't duplicate.** Use `allocateBatch`, `replan`, the ledger, and the existing `holds` mechanism and `lib/ranking.ts`. Write what you will reuse into `docs/REC_COMMITS.md` before coding.
4. **No leakage, split by time.** Same rules as HLTH02: train = days 1–30, validation = days 31–40, test = days 41–50. Tune on validation only. Open the test split **once**, after a freeze commit tagged `rec-pre-test`. All randomness is seeded. Never adjust the generator after seeing test results.
5. **Declare everything simulated.** Hospital acceptance behaviour, case experience, and capabilities come from the simulator or seed JSON, and every number describes behaviour under declared assumptions, not real-world accuracy. Say so in the README and in the UI.
6. **No clinical rules invented by the agent.** The condition list and its mapping to resource type, capability tag, and urgency live in a config file `data/conditions.json` owned by the product owner. Ship a clearly marked **placeholder** set and flag it in the final report. Do not claim it is medically validated.
7. **Access control.** Patients see only their own request. A driver sees only their own trip. A hospital user sees only requests addressed to their hospital. Follow the existing Better Auth role conventions; add a `hospital` role only if one does not exist.
8. **Server is the source of truth.** Timeouts, status, and who is assigned are decided on the server. Browsers display state.
9. **TypeScript only.** `tsx` for scripts, `vitest` for tests. No Python, no external ML API, no pretrained model.
10. **Theme.** Palette only: primary `#1E5A8E`, confirmed `#2E7D4F`, pending/uncertain `#C98A1F`, red `#C0362C` only for failures, rejections, and SOS, background `#F6F8F9`, text `#1B1F23`. Plain labels, no gradients.
11. **All tunable numbers in one config file** (`lib/recommend/constants.ts`).

---

## 1. Feature checklist (each item needs a visible artifact)

- **G1 Condition selection.** At the right trip step (when the driver reaches the patient, status `arrived_at_patient`, or at `picked_up`), the driver selects the patient's condition from a list driven by `data/conditions.json` (plus severity if configured).
- **G2 Recommendation.** The system ranks nearby hospitals for that condition and shows the top option and alternatives, each with plain-language reasons (capability match, expected bed availability at arrival, acceptance likelihood, travel time, simulated case experience).
- **G3 Automatic bed request.** The top hospital receives a bed request automatically, through the existing holds/ledger, with the patient's condition, urgency, and ETA.
- **G4 Hospital response.** The hospital sees an incoming alert, with accept or reject and a reason. **No answer within `HOSPITAL_RESPONSE_SECONDS` counts as a rejection (timeout).**
- **G5 Rejection re-routing.** On rejection or timeout, the system re-plans to the next best feasible hospital, excludes the rejecting hospital for this patient, sends a new request, and updates the driver and patient screens. Maximum `MAX_REROUTES` (default 2), then the patient is unserved with a clear reason.
- **G6 Suggested actions.** The driver sees what to do next: "Hospital B rejected: rerouting to Hospital C, ETA 12 min". When all options fail, the UI shows `EMERGENCY_FALLBACK_TEXT` and the nearest-hospital list for a manual call. These are operational suggestions only, not medical treatment advice.
- **G7 Live updates everywhere.** The driver Current Trip tab, the patient Current Emergency Request panel, and the hospital dashboard all show the same state from the same server data, including the timeline of requests and rejections.
- **G8 Driver override.** The driver can pick a different hospital than the recommendation. The override is logged with a reason, and hard rules still apply to it.
- **G9 ML model for hospital acceptance.** A custom L2 logistic regression predicts P(hospital accepts this request), trained from scratch in TypeScript on simulated history, compared against a "nearest feasible hospital" baseline on identical replay sequences.
- **G10 Evidence.** Results, limitations, and a checklist mapping each G item to the file that proves it.

---

## 2. Data and configuration

**`data/conditions.json`** (product-owner owned, placeholder until reviewed):
```
[{ "id": "cardiac_arrest", "label": "Cardiac event", "resourceType": "icu_bed",
   "capability": "cardiac", "urgency": 1 }, ...]
```
Each entry maps to exactly one required resource type, at most one capability tag, and an urgency (1/2/3). Keep to the existing capability tags (`cardiac`, `trauma`) unless the owner adds more; conditions without a matching tag use no capability.

**Hospital profile data** (simulated, in JSON or the simulator output): capabilities, capacity, and per-condition `casesHandled` counts. This is the "has handled this kind of patient" signal, and it must be labeled **simulated case experience**.

**Scoring (declared in `docs/REC_ASSUMPTIONS.md`):**
1. Filter by hard constraints (resource type, capability, open, confirmed free capacity after reservations, not already rejected by this patient, within `MAX_TRAVEL_MIN`).
2. Among feasible hospitals, minimize:
   `cost = travel_min + (1 − p_available) × REROUTE_PENALTY_MIN + (1 − p_accept) × REJECT_PENALTY_MIN − EXPERIENCE_BONUS × experience_score`
   where `p_available` comes from the existing forecaster, `p_accept` from the new acceptance model, and `experience_score` is a 0–1 normalized simulated case-volume value. All constants live in config. Tie-break: hospital id.
3. This is greedy and not globally optimal. Say so in the README.

**Fallback:** if the forecaster or acceptance model throws or returns invalid output, fall back to the baseline (current free capacity and nearest feasible hospital) and log `forecast_fallback` or `accept_model_fallback`.

---

## 3. Acceptance model (ML part)

- **Question:** P(hospital accepts a bed request) given hospital state and request.
- **Labels:** from the simulator's ground truth (the simulated hospital's actual decision), never from the model. An independent test re-derives labels from raw event logs and must match 100%.
- **Simulator extension:** add hospital accept/reject behaviour to the seeded world. A hospital rejects more often when occupancy is high, when a surge is active, near closure, or when the condition is outside its strengths. Surges and closures stay hidden from the model. **Calibrate then freeze the generator:** the overall rejection rate should fall roughly between 5% and 40% across hospital/condition/hour combinations. If it is near 0% or 100%, the experiment is uninformative, so adjust the generator **before** looking at any test result. Never adjust it afterwards.
- **Features (decision-time information only):** `free_now`, occupancy ratio, hospital recent rejection rate (past window only), walk-in arrivals in the last 30 min, request urgency, condition id (one-hot), capability match flag, ETA, hospital capacity, hour sin/cos, weekend flag.
- **Model:** L2-regularized logistic regression in TypeScript, standardized features, fixed iterations. Tune lambda on validation only. Optional Platt calibration on validation.
- **Baseline:** nearest feasible hospital with current free capacity (same interface as the forecaster).
- **Metrics:** validation during tuning; test once after the freeze. Brier score, log loss, accuracy at 0.5, a 10-bin calibration table, counts and class balance, bootstrap 95% CI (1000 resamples, fixed seed) for the Brier difference. Report that log loss is unfair for a hard 0/1 baseline.
- **Artifacts:** `model/accept-model.json` (weights, feature order, means, standard deviations, lambda, training period, seed), `model/accept-metrics.json`, `model/accept-predictions.csv`.
- **Parity test:** the runtime scorer produces the same probability as `train.ts` for 20 saved feature vectors.
- **Checkpoint:** if the model does not beat the baseline on validation, first check leakage and bugs, then try interaction terms. If it still does not beat it, keep the honest result and document it. Do not tune on test.

---

## 4. Request flow and state machine

Bed request states (map onto existing holds statuses; `requested` = `pending`):
`proposed → requested → confirmed → arrived → handed_over`, with `rejected | timeout | cancelled | lost | arrival_failed`.

Every transition is appended to a log with timestamp, actor, and reason, and shown in the timelines.

**Flow:**
1. Driver selects condition → server builds the patient (resource type, capability, urgency from `data/conditions.json`, location and ETA from live GPS) → `allocateBatch` for one patient.
2. Top hospital gets a `requested` hold plus an alert. Driver and patient screens show "Requesting bed at Hospital A".
3. Hospital accepts → `confirmed`, route and ETA update, driver continues. Hospital rejects or times out → `rejected`/`timeout` → `replan(event)` excludes that hospital for this patient and moves to the next ranked feasible hospital.
4. After `MAX_REROUTES` or no feasible hospital: unserved with a reason code (reuse the HLTH02 codes: `no_compatible_resource`, `no_capability_match`, `capacity_exhausted`, `hospitals_closed`, `rejected_no_alternative`, `handover_failed`, `travel_time_limit`), and the fallback screen appears.
5. Driver override: logged, validated against hard rules, then proceeds as above.

Invariants I1–I6 from HLTH02 are checked after every event in tests and in replays. Idempotency key `(patientId, requestId, hospitalId)` makes repeated requests return the same bed request.

---

## 5. API surface (adapt names to existing conventions)

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/trips/:id/condition` | assigned driver | set condition, returns ranked hospitals |
| POST | `/api/trips/:id/hospital-request` | assigned driver | send bed request to chosen or top hospital (supports override) |
| GET | `/api/hospital/incoming` | hospital user | pending bed requests |
| POST | `/api/hospital/requests/:id/respond` | hospital user | accept or reject with reason |
| GET | `/api/trips/:id/recommendation` | driver, patient | current ranking, reasons, request history |

Use the existing polling approach from the driver workflow (about every 3 seconds). Hospital response timeout is enforced by the server.

---

## 6. UI checklist — check what exists, add what is missing

**Instruction to the agent:** before building anything, search the repo and mark each row below **EXISTS**, **PARTIAL**, or **MISSING**, with the file path. Write the table into `docs/REC_UI_AUDIT.md`. Then add or fix only what is PARTIAL or MISSING. Do not rebuild what already works. Check each at 375px, 768px, and 1280px widths. Every item must have an empty, loading, and error state.

| # | UI element | Where | Check |
|---|---|---|---|
| U1 | Condition picker (list from `data/conditions.json`, severity if configured) | driver Current Trip tab | exists, uses config not hardcoded |
| U2 | "Recommended hospital (decision support)" card: top hospital, ETA, reasons, **not** any survival claim | driver Current Trip tab | exists |
| U3 | Alternatives list with reasons and a **choose different hospital** action (override with reason) | driver | exists |
| U4 | `p_available`, `p_accept`, and "simulated case experience" shown with plain labels | driver | exists |
| U5 | Bed-request status line: Requesting / Accepted / Rejected / Timed out, with hospital name | driver, patient | exists |
| U6 | Reroute banner: "Hospital A rejected, rerouting to Hospital B" | driver, patient | exists |
| U7 | Map shows driver, patient, and the **currently selected hospital**, route updates after reroute | driver, patient | exists |
| U8 | Request/rejection timeline (every transition from the log) | driver, patient, hospital | exists |
| U9 | Fallback screen when all hospitals fail: `EMERGENCY_FALLBACK_TEXT` and nearest-hospital list for manual call | driver, patient | exists |
| U10 | Hospital dashboard: incoming bed-request alert with condition, urgency, ETA, countdown, Accept/Reject plus reason | hospital user | exists |
| U11 | Hospital dashboard: accepted arrivals list with ETA | hospital user | exists |
| U12 | Hospital role login and route protection | hospital user | exists |
| U13 | Patient Current Emergency Request panel shows condition (if shared), hospital, ETA, and status timeline | patient | exists |
| U14 | Visible "Simulation / decision support" label wherever recommendations or model numbers appear | all | exists |
| U15 | Model box: model type, training days, test Brier vs baseline, line "Synthetic data; shows behaviour under declared assumptions" | demo page | exists |
| U16 | Demo scenario page for this feature (see Phase 6) | `/hospital-demo` | exists |
| U17 | Theme compliance: palette only, red only for failures/rejections/SOS, no overlap, no overflow, modals above the map | all | passes |
| U18 | Accessibility basics: buttons have labels, focus visible, countdowns announced, contrast OK | all | passes |

---

## 7. Phases

### Phase 0 — audit and setup (about 30 min)
- Branch `rec-feature`, record `git rev-parse HEAD` in `docs/REC_COMMITS.md` as `START_COMMIT`, tag `rec-start`.
- Inspect and write what you will reuse (engine, ledger, holds, forecaster, driver trip model, auth roles, map).
- Produce `docs/REC_UI_AUDIT.md` (section 6 table, filled in). Commit and stop.

### Phase 1 — data, config, simulator extension (about 75 min)
- `data/conditions.json` (placeholder, flagged), hospital profiles with simulated `casesHandled`, `lib/recommend/constants.ts`.
- Extend the simulator with hospital accept/reject behaviour, calibrate, **then freeze**. Write `docs/REC_ASSUMPTIONS.md` (parameters, seeds, formulas, what is hidden).
- Tests: seeded determinism, no negative values, split boundaries by day, `labels.independent.test.ts` re-deriving accept labels from raw logs.

### Phase 2 — acceptance model (about 60 min)
- Features, `train`, runtime scorer, baseline, metrics, artifacts, parity test, a clear training summary printout. Tune on validation only. Run `rec-pre-test` freeze (commit all configs and tag) **before** the first test evaluation.
- Add npm scripts `rec-gen-data`, `rec-train`, `rec-eval`, and keep `test`.

### Phase 3 — recommendation and rerouting engine (about 75 min)
- Recommendation function over `allocateBatch` with the scoring formula and fallback logging. Condition → patient mapping. Rejection/timeout → `replan` with per-patient hospital exclusion and `MAX_REROUTES`. Override handling with validation.
- Tests: hard rules never violated (property check), no downgrade, no incompatible allocation, rejection triggers replan only for the affected patient and leaves other confirmed reservations byte-for-byte unchanged, timeout counts as rejection, max reroutes then unserved with reason, override rejected if infeasible, idempotent repeat requests, fuzz test of 1,000 seeded event sequences with invariants checked after every event.

### Phase 4 — APIs and hospital side (about 75 min)
- Endpoints in section 5 with role checks and server-side timeout. Hospital dashboard (U10–U12). Tests for authorization (403 cases) and timeout.

### Phase 5 — driver and patient UI (about 75 min)
- Build or fix every PARTIAL/MISSING row from the audit (U1–U9, U13, U14, U17, U18), including live updates from the same server data and the map update after reroute.

### Phase 6 — replay evaluation and demo scenarios (about 75 min)
- Replay at least 300 **test** episodes comparing baseline (nearest feasible hospital) and model-aware (full workflow) on identical sequences. Report first-choice acceptance, reroutes per patient, time to confirmed hospital (travel plus reroute penalties), unserved by reason, urgency-1 failure rate, `incompatible_allocations` (must be 0), `double_counted_reservations` (must be 0), with paired bootstrap 95% CIs. Test is run **once**, after the freeze, with a one-shot guard like HLTH02. Pick one real case where the model-aware method did worse and analyze it in `limitations.md`.
- Scenario files in `data/scenarios/` and the `/hospital-demo` page, labeled "Simulation", no real data written:
  - **H1 normal:** condition chosen, top hospital accepts.
  - **H2 rejection:** top hospital rejects, rerouted to second, driver and patient screens update.
  - **H3 timeout:** hospital does not answer, counts as rejection, rerouted.
  - **H4 all fail:** no hospital accepts or has capacity, fallback screen with reason codes, no downgrade.
  - **H5 override:** driver picks a different hospital, logged, hard rules still enforced.
  - **H6 model failure:** acceptance model unavailable, fallback to baseline, `accept_model_fallback` flagged in the log.
  - **H7 duplicate:** repeated bed requests are idempotent, two patients racing for the last bed produce exactly one winner.

### Phase 7 — evidence package (about 45 min)
- `evidence/rec/README.md`: start and final commit ids, change summary, setup, exact commands, data sources (all synthetic), schemas, how labels are produced and independently checked, generator assumptions and seeds, split day ranges, model identity (custom L2 logistic regression in TypeScript, trained from scratch, no pretrained model or API), baseline comparison, scoring formula, scenario logs, reason codes, the statement that the greedy method is not globally optimal and that recommendations are decision support with driver override.
- `evidence/rec/CHECKLIST.md` mapping G1–G10 and U1–U18 to the file or test that proves each.
- `evidence/rec/limitations.md` with at least one documented failure, any change made after test results, the placeholder status of `data/conditions.json`, and that results are synthetic.

---

## 8. Cut list (if running late, cut in this order)

1. Experience bonus and its UI (`casesHandled`).
2. Interaction terms and any second baseline.
3. Hospital dashboard polish (keep accept/reject and timeout).
4. UI polish beyond U17/U18.

**Never cut:** hard rules, no downgrades, timeout-as-rejection, per-patient hospital exclusion with max reroutes, the time-based split, the baseline comparison on identical replays, the invariant and idempotency tests, the "decision support" labeling, and `limitations.md`.

---

## 9. Definition of done

- `npm run test` passes, including the fuzz, independent-label, parity, and authorization tests, and the type-check and production build pass.
- `npm run rec-eval` reproduces the same numbers from the same seeds (the test split is protected by a one-shot guard, so confirm reproducibility on validation).
- Selecting a condition shows a ranked recommendation with reasons, sends the bed request automatically, and a rejection or timeout reroutes to the next hospital on the driver, patient, and hospital screens.
- Every row in `docs/REC_UI_AUDIT.md` is EXISTS or fixed, and the UI matches the theme at 375, 768, and 1280px.
- Zero incompatible allocations and zero double-counted reservations in all replays.
- No screen or document claims a guarantee of survival.
- Your final message lists what was built, what was skipped, and every assumption you made.

---

## 10. Items only the product owner can provide (report if still placeholder)

- The reviewed condition list and its mapping to resource type, capability, and urgency (`data/conditions.json`).
- Hospital capabilities and capacities (real or agreed seed data).
- Hospital staff accounts and the `hospital` role.
- `EMERGENCY_FALLBACK_TEXT` (the real number or instruction for your region).
- Final values for `HOSPITAL_RESPONSE_SECONDS` and `MAX_REROUTES` if the defaults are not acceptable.
