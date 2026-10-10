import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { baselineForecaster } from "../lib/allocation/baseline.ts";
import { buildFeatureVector } from "./features.ts";
import { loadModelForecaster, type LogisticModelArtifact } from "../lib/allocation/forecaster.ts";
import { calculateMetrics, pairedBrierDifferenceInterval } from "./metrics.ts";
import type { DecisionSample } from "./world.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataDirectory = join(root, "data", "synthetic");
const modelDirectory = join(root, "model");
const BOOTSTRAP_SEED = 20261012;

async function main() {
  const [metricsText, predictionsText, modelText] = await Promise.all([
    readFile(join(modelDirectory, "metrics.json"), "utf8"),
    readFile(join(modelDirectory, "predictions.csv"), "utf8"),
    readFile(join(modelDirectory, "model.json"), "utf8"),
  ]);
  const metricsFile = JSON.parse(metricsText) as Record<string, unknown>;
  const existingRows = predictionsText.trimEnd().split("\n");
  if (metricsFile.test || existingRows.some((row) => row.endsWith(",test"))) {
    throw new Error("Test results already exist; the single permitted test evaluation has already run.");
  }
  const datasetText = await readFile(join(dataDirectory, "test.json"), "utf8");
  const dataset = JSON.parse(datasetText) as { seed: number; split: string; samples: DecisionSample[] };
  if (dataset.split !== "test" || dataset.samples.some((sample) => sample.day < 41 || sample.day > 50)) throw new Error("Test file does not contain only days 41–50.");
  const modelArtifact = JSON.parse(modelText) as LogisticModelArtifact;
  const model = loadModelForecaster();
  const labels = dataset.samples.map((sample) => sample.label);
  const modelProbabilities = dataset.samples.map((sample) => model(sample));
  const baselineProbabilities = dataset.samples.map(baselineForecaster);
  const modelMetrics = calculateMetrics(modelProbabilities, labels);
  const baselineMetrics = calculateMetrics(baselineProbabilities, labels);
  const brierDifferenceInterval = pairedBrierDifferenceInterval(modelProbabilities, baselineProbabilities, labels, BOOTSTRAP_SEED, 1000);
  metricsFile.test = {
    sampleCount: dataset.samples.length,
    seed: dataset.seed,
    days: [41, 50],
    model: modelMetrics,
    baseline: baselineMetrics,
    brierDifferenceModelMinusBaseline: modelMetrics.brierScore - baselineMetrics.brierScore,
    pairedBrierDifferenceBootstrap95: brierDifferenceInterval,
    note: "Single evaluation after hlth02-pre-test freeze; test set is not used for tuning.",
  };
  metricsFile.testEvaluation = "Evaluated once after the hlth02-pre-test freeze; see the test section.";
  metricsFile.logLossComparisonNote = "Log loss is not a fair comparison because the baseline outputs hard 0/1 probabilities.";
  await writeFile(join(modelDirectory, "metrics.json"), `${JSON.stringify(metricsFile, null, 2)}\n`, "utf8");

  const predictionRows = dataset.samples.map((sample, index) => {
    const featureVector = buildFeatureVector(sample, modelArtifact.trainingStayDurations);
    const hash = createHash("sha256").update(JSON.stringify(featureVector)).digest("hex");
    return `${sample.id},${hash},${modelProbabilities[index]},${sample.label},test`;
  });
  if (existingRows[0] !== "sample_id,features_hash,p,label,split") throw new Error("Prediction file is malformed.");
  await appendFile(join(modelDirectory, "predictions.csv"), `${predictionRows.join("\n")}\n`, "utf8");
  console.log(`Single frozen test evaluation (${dataset.samples.length} samples, days 41–50).`);
  console.log(`Brier: model ${modelMetrics.brierScore.toFixed(4)}, baseline ${baselineMetrics.brierScore.toFixed(4)}, paired 95% CI for model-minus-baseline [${brierDifferenceInterval.lower95.toFixed(4)}, ${brierDifferenceInterval.upper95.toFixed(4)}].`);
  console.log("Calibration (10 bins; mean predicted vs observed rate):");
  console.table(modelMetrics.calibration10Bins.map(({ bin, count, meanPrediction, observedRate }) => ({ bin, count, meanPrediction, observedRate })));
  console.log(`Accuracy: model ${modelMetrics.accuracyAtHalf.toFixed(3)}, baseline ${baselineMetrics.accuracyAtHalf.toFixed(3)}.`);
  console.log(`Log loss (not a fair comparison because the baseline outputs hard 0/1 probabilities): model ${modelMetrics.logLoss.toFixed(4)}, baseline ${baselineMetrics.logLoss.toFixed(4)}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
