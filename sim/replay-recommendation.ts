import { open, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCEPTANCE_FEATURE_ORDER, deriveAcceptanceLabel, type AcceptanceSample } from "./acceptance-world.ts";
import { scoreAcceptance, type AcceptanceModelArtifact } from "../lib/recommend/accept-model.ts";
import { RECOMMENDATION } from "../lib/recommend/constants.ts";
import { createRng } from "./world.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
type Dataset = { split: string; days: [number, number]; samples: AcceptanceSample[] };
type Outcome = { firstChoiceAccepted: boolean; reroutes: number; minutesToConfirm: number | null; unservedReason: string | null; urgencyOneFailed: boolean; winner: string | null };

function run(candidates: AcceptanceSample[], strategy: "nearest" | "model", model: AcceptanceModelArtifact): Outcome {
  const eligible = candidates.filter((sample) => sample.features[0] > 0 && sample.features[ACCEPTANCE_FEATURE_ORDER.indexOf("capability_match")] === 1);
  const ordered = eligible.map((sample) => ({ sample, eta: sample.features[ACCEPTANCE_FEATURE_ORDER.indexOf("eta_min")], p: scoreAcceptance(sample.features, model) }))
    .sort((a, b) => (strategy === "nearest" ? a.eta - b.eta : a.eta + (1 - a.p) * RECOMMENDATION.rejectPenaltyMin - (b.eta + (1 - b.p) * RECOMMENDATION.rejectPenaltyMin)) || a.sample.hospitalId.localeCompare(b.sample.hospitalId));
  let elapsed = 0;
  for (let index = 0; index < ordered.length && index <= RECOMMENDATION.maxReroutes; index += 1) {
    const option = ordered[index];
    if (index === 0 && deriveAcceptanceLabel(option.sample.raw) === 1) return { firstChoiceAccepted: true, reroutes: 0, minutesToConfirm: option.eta, unservedReason: null, urgencyOneFailed: false, winner: option.sample.hospitalId };
    if (index === 0) { elapsed += RECOMMENDATION.rejectPenaltyMin; }
    else elapsed += RECOMMENDATION.rejectPenaltyMin;
    if (deriveAcceptanceLabel(option.sample.raw) === 1) return { firstChoiceAccepted: index === 0, reroutes: index, minutesToConfirm: elapsed + option.eta, unservedReason: null, urgencyOneFailed: false, winner: option.sample.hospitalId };
  }
  const urgency = candidates[0]?.features[ACCEPTANCE_FEATURE_ORDER.indexOf("urgency")] ?? 3;
  return { firstChoiceAccepted: false, reroutes: Math.min(ordered.length, RECOMMENDATION.maxReroutes), minutesToConfirm: null, unservedReason: eligible.length ? "rejected_no_alternative" : "capacity_exhausted", urgencyOneFailed: urgency === 1, winner: null };
}

function pairedInterval(a: number[], b: number[]) {
  const diffs = a.map((value, i) => value - b[i]); const mean = diffs.reduce((sum, x) => sum + x, 0) / diffs.length; const rng = createRng(RECOMMENDATION.bootstrapSeed);
  const reps = Array.from({ length: RECOMMENDATION.bootstrapResamples }, () => { let total = 0; for (let i = 0; i < diffs.length; i += 1) total += diffs[Math.floor(rng() * diffs.length)]; return total / diffs.length; }).sort((x, y) => x - y);
  return { estimate: mean, lower95: reps[Math.floor(0.025 * (reps.length - 1))], upper95: reps[Math.floor(0.975 * (reps.length - 1))], resamples: reps.length, seed: RECOMMENDATION.bootstrapSeed };
}

async function main() {
  const evidence = join(root, "evidence/rec"); await mkdir(evidence, { recursive: true });
  const lock = await open(join(evidence, ".recommendation-replay.lock"), "wx").catch(() => null);
  if (!lock) throw new Error("Recommendation test replay already attempted; refusing to repeat the holdout replay.");
  try {
    const data = JSON.parse(await readFile(join(root, "data/synthetic/acceptance/test.json"), "utf8")) as Dataset;
    const model = JSON.parse(await readFile(join(root, "model/accept-model.json"), "utf8")) as AcceptanceModelArtifact;
    if (data.split !== "test" || data.days[0] !== 41 || data.days[1] !== 50) throw new Error("Replay requires the frozen test split (days 41–50).");
    const groups = new Map<string, AcceptanceSample[]>();
    for (const sample of data.samples) { const key = `${sample.day}:${sample.conditionId}:${Math.floor(sample.minute / 60)}`; const group = groups.get(key) ?? []; group.push(sample); groups.set(key, group); }
    const episodes = [...groups.values()].filter((group) => group.length >= 3).slice(0, 300);
    if (episodes.length < 300) throw new Error(`Expected at least 300 test episodes; found ${episodes.length}.`);
    const nearest = episodes.map((group) => run(group, "nearest", model)); const aware = episodes.map((group) => run(group, "model", model));
    const brierLikeDelta = pairedInterval(aware.map((x) => Number(x.winner !== null)), nearest.map((x) => Number(x.winner !== null)));
    const worseIndex = aware.findIndex((x, i) => (x.minutesToConfirm ?? Infinity) > (nearest[i].minutesToConfirm ?? Infinity) || (x.winner === null && nearest[i].winner !== null));
    const mean = (items: Outcome[], field: "reroutes" | "minutesToConfirm") => items.reduce((sum, item) => sum + (item[field] ?? 0), 0) / items.length;
    const failedUrgencyOne = (items: Outcome[]) => items.filter((item) => item.urgencyOneFailed).length;
    const report = { split: "test", days: data.days, episodes: episodes.length, methodology: "Groups frozen test decisions by day, condition and hour (at least three hospital observations); candidate feasibility requires positive free_now and capability_match. Baseline orders by each candidate's ETA. Model-aware ordering minimizes ETA + (1 - p_accept) * configured reject penalty, then runs sequential acceptance decisions using the simulator's raw ground-truth outcomes, with at most MAX_REROUTES. This is a synthetic replay proxy: availability forecasting, production ledger contention, real response-time distributions and travel route geometry are not simulated here.", metrics: { nearest: { firstChoiceAcceptance: nearest.filter((x) => x.firstChoiceAccepted).length / nearest.length, meanReroutes: mean(nearest, "reroutes"), meanMinutesToConfirmed: mean(nearest, "minutesToConfirm"), unservedByReason: { rejected_no_alternative: nearest.filter((x) => x.unservedReason === "rejected_no_alternative").length, capacity_exhausted: nearest.filter((x) => x.unservedReason === "capacity_exhausted").length }, urgencyOneFailures: failedUrgencyOne(nearest) }, modelAware: { firstChoiceAcceptance: aware.filter((x) => x.firstChoiceAccepted).length / aware.length, meanReroutes: mean(aware, "reroutes"), meanMinutesToConfirmed: mean(aware, "minutesToConfirm"), unservedByReason: { rejected_no_alternative: aware.filter((x) => x.unservedReason === "rejected_no_alternative").length, capacity_exhausted: aware.filter((x) => x.unservedReason === "capacity_exhausted").length }, urgencyOneFailures: failedUrgencyOne(aware) }, pairedConfirmedRateDifference: brierLikeDelta, incompatible_allocations: 0, double_counted_reservations: 0 }, worseCase: worseIndex >= 0 ? { episodeKey: [...groups.keys()][worseIndex], nearest: nearest[worseIndex], modelAware: aware[worseIndex] } : null, note: "The paired interval is for confirmed-vs-unserved rate (model-aware minus nearest), not Brier score. The proxy's zero constraint counters reflect its single-resource, single-request episode construction; they do not establish production concurrency safety." };
    await writeFile(join(evidence, "recommendation-replay.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`One-shot recommendation replay: ${episodes.length} test episodes; paired confirmed-rate delta ${brierLikeDelta.estimate.toFixed(4)} (95% CI ${brierLikeDelta.lower95.toFixed(4)} to ${brierLikeDelta.upper95.toFixed(4)}).`);
  } finally { await lock.close(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
