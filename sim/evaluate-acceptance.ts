import { open, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCEPTANCE_FEATURE_ORDER, deriveAcceptanceLabel, type AcceptanceSample } from "./acceptance-world.ts";
import { calculateMetrics, pairedBrierDifferenceInterval } from "./metrics.ts";
import { scoreAcceptance, type AcceptanceModelArtifact } from "../lib/recommend/accept-model.ts";
import { RECOMMENDATION } from "../lib/recommend/constants.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
type Dataset = { seed: number; split: string; days: [number, number]; samples: AcceptanceSample[] };

async function main() {
  const tag = execFileSync("git", ["rev-parse", "rec-pre-test"], { cwd: root, encoding: "utf8" }).trim();
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (tag !== head) throw new Error("Run the one-shot test evaluation from the exact rec-pre-test freeze commit.");
  const evidence = join(root, "evidence/rec");
  await mkdir(evidence, { recursive: true });
  const lockPath = join(evidence, ".accept-test-eval.lock");
  const lock = await open(lockPath, "wx").catch(() => null);
  if (!lock) throw new Error("Acceptance test evaluation has already been attempted; one-shot lock exists.");
  try {
    const reportPath = join(evidence, "accept-test-evaluated.json");
    await access(reportPath).then(() => { throw new Error("Refusing to overwrite the existing acceptance test result."); }).catch((error: unknown) => { if (error instanceof Error && error.message.startsWith("Refusing")) throw error; });
    const [datasetText, modelText] = await Promise.all([
      readFile(join(root, "data/synthetic/acceptance/test.json"), "utf8"),
      readFile(join(root, "model/accept-model.json"), "utf8"),
    ]);
    const dataset = JSON.parse(datasetText) as Dataset;
    const model = JSON.parse(modelText) as AcceptanceModelArtifact;
    if (dataset.split !== "test" || dataset.days[0] !== 41 || dataset.days[1] !== 50 || model.featureOrder.join("\0") !== ACCEPTANCE_FEATURE_ORDER.join("\0")) throw new Error("Acceptance holdout or model does not match the frozen expected split/schema.");
    const labels = dataset.samples.map((sample) => deriveAcceptanceLabel(sample.raw));
    if (labels.some((label, index) => label !== dataset.samples[index].label)) throw new Error("Independent raw-event label check failed.");
    const probabilities = dataset.samples.map((sample) => scoreAcceptance(sample.features, model));
    const baselineProbabilities = dataset.samples.map(() => 1);
    const metrics = calculateMetrics(probabilities, labels);
    const baseline = calculateMetrics(baselineProbabilities, labels);
    const interval = pairedBrierDifferenceInterval(probabilities, baselineProbabilities, labels, RECOMMENDATION.bootstrapSeed, RECOMMENDATION.bootstrapResamples);
    const result = { split: "test", days: [41, 50], sampleCount: dataset.samples.length, counts: { accepted: labels.filter(Boolean).length, rejected: labels.filter((label) => !label).length }, model: metrics, nearestFeasibleBaseline: baseline, brierDifferenceModelMinusBaseline: interval, independentLabelsMatched: true, baselineNote: "Log loss is unfair to the nearest-feasible hard 0/1 baseline.", seed: dataset.seed };
    await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    const metricsPath = join(root, "model/accept-metrics.json");
    const storedMetrics = JSON.parse(await readFile(metricsPath, "utf8")) as Record<string, unknown>;
    storedMetrics.test = result;
    await writeFile(metricsPath, `${JSON.stringify(storedMetrics, null, 2)}\n`, "utf8");
    const predictionsPath = join(root, "model/accept-predictions.csv");
    const priorCsv = await readFile(predictionsPath, "utf8");
    const testRows = dataset.samples.map((sample, index) => `${sample.id},${sample.day},${probabilities[index]},${labels[index]},test`);
    await writeFile(predictionsPath, `${priorCsv}${testRows.join("\n")}\n`, "utf8");
    console.log(`One-shot test evaluation: ${metrics.count} samples; model Brier ${metrics.brierScore.toFixed(4)}, baseline Brier ${baseline.brierScore.toFixed(4)}; paired 95% CI [${interval.lower95.toFixed(4)}, ${interval.upper95.toFixed(4)}].`);
  } finally {
    await lock.close();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
