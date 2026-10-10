# HLTH02_BUILD_SPEC.md — Emergency Resource Allocation (hackathon problem statement HLTH 02)

You are a coding agent extending an existing app (CareLink: Next.js App Router +
TypeScript, MongoDB, Better Auth, Tailwind). This file is self-contained. The
whole build has an **8-hour budget**, so follow the phases and the cut list at the
end. Work **one phase at a time**, run the tests, commit with the prefix
`hlth02:`, then stop and report before starting the next phase.

The product owner is not an ML specialist. Keep code simple, readable, and
commented. Prefer boring and correct over clever.

## 0. Rules that apply everywhere

1. **Language: TypeScript only.** Run scripts with `tsx`, tests with `vitest`. No Python, so there are no training/serving mismatches and the evaluator is one command.
2. **Learned predictions only support decisions. Hard rules always win.** A forecast may rank options that are already feasible. It may never create capacity, override a confirmed occupancy, a closure, or an existing reservation.
3. **Everything is reproducible.** All randomness uses a seeded generator (for example mulberry32). Seeds live in `data/synthetic/assumptions.md` and in the config files.
4. **No leakage.** The forecaster's inputs may only use information available at the decision time. The simulator's future events (walk-in surges, closures, resource loss, stay lengths of current patients) are hidden from it.
5. **Split by time, never randomly:** train = days 1–30, validation = days 31–40, test = days 41–50 of the simulated period. Tune hyperparameters and calibration on validation only. The test set is opened **once** at the end (see "Freeze").
6. **Labels come from the simulator's ground truth, not from the model.** An independent test re-derives labels from raw event logs and must match 100%.
7. **Declare everything that is simulated.** Every number in the results is on synthetic inputs and describes behaviour under the declared assumptions, not real-world accuracy. Say so in the README.
8. No hardcoded demo data inside components. Scenarios are JSON files read from `data/scenarios/`.
9. Reuse the existing code where it exists: the existing ranking logic (`lib/ranking.ts`) for resource and capability matching, and the existing `holds` collection for live reservations. Inspect the repo first and extend; don't duplicate.

## 1. Problem statement checklist (each item needs a visible artifact)

**Addition 1: batch allocation with replanning**
- R1 Allocate a batch of patients across hospitals using urgency, required resources, travel times, and **confirmed** capacity. Objective and priority policy are written down (section 3).
- R2 Reservations stay valid under simultaneous requests. Replan after a rejection, a resource loss, or a changed travel time, keeping accepted handovers where appropriate.
- R3 Show assigned and **unserved** patients with a reason for each. Never silently allocate an incompatible resource. Never count a reservation twice.

**Addition 2: forecasting availability at arrival**
- R4 A model estimates the probability that a unit of a resource type will be available when the patient arrives (the ETA), from historical or simulated occupancy and event data.
- R5 The probability (uncertainty) ranks feasible allocations. It never overrides confirmed occupancy, closures, or reservations.
- R6 Compare the predictor **and** the whole allocation workflow against a **current-capacity-only baseline** on **identical replay sequences**. Report prediction error and handover outcomes.

**Scope:** a small hospital network (4 hospitals), at least two resource types, competing requests.
**Required demonstrations:** a patient surge, a hospital rejection, an availability change during travel, insufficient capacity, and duplicate or simultaneous reservation attempts. At least four distinct end-to-end scenarios covering normal operation, changing information, and failure or uncertainty.

## 2. Repository layout (create these)

```
lib/allocation/
  types.ts            shared types
  constants.ts        all tunable numbers, read from one config
  ledger.ts           reservation ledger + state machine + invariants
  engine.ts           batch allocation + replanning (takes a "forecaster" function)
  forecaster.ts       loads model.json, builds features, returns probability
  baseline.ts         current-capacity-only forecaster (same interface)
sim/
  world.ts            seeded hospital world simulator (ground truth)
  generate.ts         writes data/synthetic/*.json
  features.ts         feature building from information available at decision time
  train.ts            trains the logistic model, writes model/model.json + metrics
  replay.ts           replay one episode with a chosen forecaster
  evaluate.ts         runs all test episodes for baseline and model, writes evidence/results
data/synthetic/       train.json, val.json, test.json, assumptions.md
data/scenarios/       s1-normal.json ... s6-uncertainty.json (with expected outcomes)
model/                model.json, metrics.json, predictions.csv
evidence/             README.md, COMMITS.md, results.json, results.md, replay-logs/, limitations.md
app: app/surge-demo/page.tsx, app/api/allocate-batch/route.ts
tests/                vitest files
```

npm scripts to provide: `gen-data`, `train`, `eval`, `test`, `dev`.

## 3. Declared definitions and assumptions (copy into `assumptions.md`)

**Resources.** Two types: `icu_bed` and `emergency_bed`. Each hospital also has capability tags (`cardiac`, `trauma`). A patient requires exactly one resource type and optionally one capability.

**Urgency.** 1 critical, 2 urgent, 3 less urgent. Weights 100 / 10 / 1.

**Hard constraints (never violated, enforced in the ledger and the engine):**
- a patient only gets the resource type they require; **no downgrades, ever**
- capability must match
- the hospital must not be closed for that type
- a unit can only be reserved if confirmed free capacity exists after subtracting active reservations for that hospital and type
- a patient has at most one active reservation
- confirmed reservations of other patients are never preempted by a higher-urgency patient (policy choice: accepted handovers are preserved)

**Objective (lexicographic).**
1. Serve as many urgent patients as possible: higher urgency is allocated first.
2. Among feasible hospitals for a patient, minimize
   `cost = travel_min + (1 − p_available) × REROUTE_PENALTY_MIN`
   where `p_available` comes from the forecaster and `REROUTE_PENALTY_MIN` is a constant (default 25).
3. Tie-break: lower hospital rejection rate, then hospital id.
Allocation order: urgency (1 first), then time waiting, then patient id. Greedy in that order is the declared algorithm. State in the README that it is not globally optimal.

**Reservation semantics (important assumption).** Reservations are enforced among platform patients (hard). Walk-in demand from outside the platform is not controlled, so a reserved unit can still be gone at arrival. This is the uncertainty the forecaster addresses. Hospitals only confirm a reservation if a unit is free at confirmation time.

**Reservation state machine** (maps onto the existing holds statuses: `requested` = `pending`):
`proposed → requested → confirmed → arrived → handed_over`
`requested → rejected | expired`; `confirmed → lost` (resource loss or closure); `confirmed → arrival_failed` (no unit at arrival); any active state → `cancelled`.
Every transition is appended to a log with a timestamp, actor, and reason.

**Replan triggers:** hospital rejection; resource loss or closure affecting a reserved unit; ETA change of more than 10 minutes; arrival failure. Replanning only touches the affected patients. Maximum 2 reroutes per patient, then the patient is unserved with `handover_failed`.

**Unserved reason codes (exactly these):** `no_compatible_resource`, `no_capability_match`, `capacity_exhausted`, `hospitals_closed`, `displaced_by_higher_priority`, `rejected_no_alternative`, `handover_failed`, `travel_time_limit`.

**Ledger invariants** (checked after every event, in tests and in every replay):
- I1 active reservations per (hospital, type) never exceed confirmed free units
- I2 every patient has at most one active reservation
- I3 each reservation is counted once (capacity is derived from the set of reservation ids, not from a mutable counter)
- I4 resource type always equals the patient's requirement
- I5 no active reservation at a hospital closed for that type
- I6 only allowed state transitions occur
A violated invariant throws and fails the run loudly.

## 4. Phases

### Phase 0 — setup (15 min)
- [ ] Write the current `git rev-parse HEAD` into `evidence/COMMITS.md` as `START_COMMIT`, create a branch `hlth02`, and tag `hlth02-start`
- [ ] Install `tsx`, `vitest`; add the npm scripts. Inspect the existing ranking, holds, and hospital data model, and note in `evidence/COMMITS.md` what you will reuse

### Phase 1 — simulator and data (about 90 min)
Build `sim/world.ts`: a seeded minute-resolution simulation of 4 hospitals (different capacities and demand), 2 resource types, 50 days.
- Occupied units have hidden stay lengths (log-normal; emergency beds a few hours, ICU beds much longer)
- Walk-in demand per hospital and type: Poisson with a time-of-day pattern, plus random **surge events** that multiply demand for 30–90 minutes
- Random **closures** and **resource-loss events**, rare and hidden from the forecaster
- Hospitals differ in size and demand so that pressure differs even when the free count is identical
- Output per day: the full ground-truth free-unit timeline, plus the observable history a hospital system would really have (current occupancy, admission times, recent walk-in counts)
- Generate **decision samples**: at random times, for random (hospital, type, ETA between 10 and 60 min, k = number of units needed including platform patients already planned there)
- Label = 1 if free units at `t + ETA` in the ground truth ≥ k. Store the labels from the ground truth, separately from the features
- Write `train.json` / `val.json` / `test.json` split by day, and `assumptions.md` (all parameters, seeds, formulas, what is hidden)

**Calibrate the generator, then freeze it.** Report the base rate of "free now but gone by arrival". It should fall roughly between 5% and 40% across hospital/type/hour combinations. If it is near 0% or 100%, the experiment is uninformative, so adjust the generator now. **Never adjust the generator after seeing test results.**

Tests: seeded determinism (same seed gives identical data), no negative occupancy, split boundaries by day, and `labels.independent.test.ts` re-deriving labels from raw timelines by separate code.

### Phase 2 — forecaster (about 75 min)
- **Model:** L2-regularized logistic regression, written in TypeScript (standardize features, gradient descent or Newton steps, fixed iterations). Output `P(free units at arrival ≥ k)`.
- **Features (decision-time information only):** `free_now`, `free_now − k`, `k`, occupancy ratio, `eta_min`, walk-in arrivals in the last 30 min, expected releases within the ETA (computed from elapsed stays and the **training-period** stay-length distribution), hour sin/cos, weekend flag, resource-type flag. Add interaction terms only if validation shows a benefit.
- Tune the regularization strength and (optionally) a Platt calibration on **validation** only.
- **Baseline forecaster (same interface):** `p = 1 if free_now ≥ k else 0` (current capacity only). Optional second baseline: historical base rate per hospital, type, and hour.
- Metrics on validation during tuning; on test **once**, after the freeze: Brier score, log loss, accuracy at 0.5, a 10-bin calibration table, and counts. Compare with the baseline on the same samples. Report sample counts, class balance, and units. Add bootstrap 95% confidence intervals (1000 resamples, fixed seed) for the Brier difference.
- Artifacts: `model/model.json` (weights, feature order, means, standard deviations, lambda, training period, seed, library versions), `model/metrics.json`, `model/predictions.csv` (sample id, features hash, p, label, split).
- `train.ts` prints a clear summary so the training step is visible in the demo.
- **Parity test:** `forecaster.ts` (runtime) must produce the same probability as `train.ts` for 20 saved feature vectors.

**Checkpoint:** if the model does not beat the baseline's Brier score on validation, first check feature leakage and bugs. Then try adding interaction terms. If it still doesn't beat the baseline, keep the honest result and document it; do not tune on test.

### Phase 3 — allocation engine and ledger (about 100 min)
- `ledger.ts`: reservations with ids, the state machine, atomic `reserve()` (checks all hard constraints and idempotency in one step), `confirm`, `reject`, `expire`, `lose`, `cancel`, `complete`. An idempotency key of `(patientId, batchId)` means a repeated request returns the same reservation. A second hospital for a patient who already holds an active reservation is refused unless an explicit `move` first releases the old one.
- `engine.ts`: `allocateBatch(patients, hospitalsSnapshot, forecaster, ledger)` implements section 3. It returns assignments with `p_available`, travel time, cost, and a human-readable reason, plus the unserved list with reason codes. `replan(event)` handles the triggers and keeps untouched confirmed reservations intact.
- Reuse the existing resource and capability matching from `lib/ranking.ts` for feasibility.
- A `forecaster` argument lets the same engine run as baseline or model-aware.
- Failure and uncertainty: if the forecaster throws or returns invalid output, fall back to the baseline forecaster and record `forecast_fallback` in the log.
- Tests (vitest):
  - one unit and two patients: exactly one wins, the other is unserved or re-routed with a reason
  - the same patient reserved twice (same and different hospital): one active reservation
  - **fuzz test:** 1,000 random event sequences with a fixed seed, invariants I1–I6 checked after every event
  - no incompatible allocation ever (property check)
  - rejection triggers replan only for the affected patient; other confirmed reservations remain byte-for-byte unchanged
  - insufficient capacity: patients end as unserved with `capacity_exhausted`, never downgraded
  - higher urgency is served before lower urgency when capacity is short

### Phase 4 — replay and evaluation (about 60 min)
- `replay.ts` replays one episode: a batch (8–15 patients) arriving at a decision time, using the ground-truth world from a **test-split day** for everything that happens afterwards (hospital rejections at confirmation if no unit is free, walk-in consumption, closures, travel time changes). A patient arrives after their ETA; handover succeeds if a unit exists then, after subtracting platform patients already handed over there.
- Run the same episodes with the baseline forecaster and the model forecaster (identical inputs, identical random draws).
- `evaluate.ts` runs at least 300 test episodes and writes `evidence/results.json` and `results.md` with, per method: handover success on first choice, reroutes per patient, mean and 90th percentile time to handover (travel plus reroute penalties), unserved count by reason, urgency-1 failure rate, `incompatible_allocations` (must be 0), `double_counted_reservations` (must be 0). Report paired bootstrap 95% confidence intervals for the differences.
- Save replay logs for every scenario in `evidence/replay-logs/` as JSON lines.
- **Freeze:** after Phase 2 tuning and before the first test evaluation, commit all configs and tag `hlth02-pre-test`. Then run `npm run eval` once and record the output. If you change anything after seeing test results, say so in `evidence/limitations.md`.
- Pick at least one real case from the test run where the model-aware method did **worse** than the baseline (or the model failed) and analyze it in `limitations.md`.

### Phase 5 — scenarios and app (about 75 min)
Scenario files (`data/scenarios/*.json`, each with seed, inputs, and expected outcomes):
- **S1 normal operation:** 4 patients, all served at preferred hospitals
- **S2 surge + insufficient capacity:** 14 patients, ICU is short: higher urgency first, remaining ICU patients unserved with reasons, no downgrade
- **S3 hospital rejection:** a hospital rejects, only that patient is replanned, accepted handovers are untouched
- **S4 availability change during travel:** a unit is lost or travel time jumps while patients are en route; replan; show baseline versus model-aware outcomes on this identical sequence
- **S5 duplicate and simultaneous attempts:** repeated requests for one patient, and two patients racing for the last unit; the log shows idempotent handling and exactly one winner
- **S6 uncertainty and failure:** forecaster unavailable (fallback to baseline, flagged in the log) and a hospital closure

Page `app/surge-demo/page.tsx` (public, clearly labeled "Simulation", no real data written):
- scenario picker with Run, Step, and Reset
- hospital capacity panel: free units by type, closure status, and forecast probability for the chosen patient
- patient table: urgency, requirement, assigned hospital, ETA, `p_available`, status, and the reason when unserved
- reservation timeline: every state transition from the log
- side-by-side result: baseline versus model-aware on the same replay (handover success, reroutes, unserved)
- a "Model" box: model type, training days, test Brier versus baseline, and the line "Synthetic data; shows behaviour under declared assumptions"
Use the project palette (primary `#1E5A8E`, green `#2E7D4F` for confirmed, amber `#C98A1F` for pending or uncertain, red `#C0362C` only for failures or rejections, background `#F6F8F9`, text `#1B1F23`). Plain labels, no sparkle or gradient styling.

`POST /api/allocate-batch` (signed-in, role per existing conventions): reads hospital capacity from MongoDB and creates holds through the existing hold mechanism with atomic claims. **Should-have, not must-have** (see cut list). It must reuse `engine.ts`, not copy it.

### Phase 6 — evidence package (about 45 min)
`evidence/README.md` must contain: start and final commit ids, a concise change summary, setup instructions, exact commands (`npm run gen-data`, `train`, `eval`, `test`, `dev`), data sources and permissions (all synthetic, generated by code, no real patient data), schemas, how labels are produced and independently checked, generator assumptions and seeds, the split with day ranges, model identity (custom L2 logistic regression in TypeScript, trained from scratch on synthetic data, no pretrained model or API is used for the two additions; if the Grok triage chatbot appears in the demo, name it separately and state that it does not affect allocation), parameters, saved predictions, baseline comparison, scenario logs, objectives and priority policy, reservation transitions, unserved reasons, and `limitations.md` with at least one documented failure or limitation. Add `evidence/CHECKLIST.md` mapping each requirement R1–R6 and each required demonstration to the file that proves it.

## 5. Cut list (if running late, cut in this order)
1. Live Mongo-backed `POST /api/allocate-batch` (keep the simulation page)
2. Second baseline and interaction terms
3. UI polish
4. S6 failure scenario's closure half (keep the forecaster-fallback half)

**Never cut:** the time-based split, the baseline comparison on identical replays, the invariant and duplicate tests, the evidence README, and `limitations.md`.

## 6. Definition of done
- `npm run test` passes, including the fuzz and independent-label tests
- `npm run eval` reproduces the same numbers from the same seeds
- The demo page runs S1–S6 and shows reasons for every unserved patient
- Results report the baseline comparison with confidence intervals and an honest limitations section
- Zero incompatible allocations and zero double-counted reservations in all replays
- Your final message lists what was built, what was skipped, and any assumption you made