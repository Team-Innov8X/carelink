import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { baselineForecaster } from "../lib/allocation/baseline.ts";
import { createModelForecaster, type LogisticModelArtifact } from "../lib/allocation/forecaster.ts";
import { buildFeatureVector, FEATURE_ORDER, type TrainingStayDurations } from "./features.ts";
import { calculateMetrics } from "./metrics.ts";
import { fitLogisticRegression, logisticProbabilityFromFit } from "./logistic.ts";
import type { DecisionSample } from "./world.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataDirectory = join(root, "data", "synthetic");
const modelDirectory = join(root, "model");
const LAMBDA_CANDIDATES = [0.001, 0.01, 0.1, 1, 10];

interface DatasetFile { seed: number; split: string; samples: DecisionSample[]; trainingStayDurations?: TrainingStayDurations }

async function readDataset(name: string): Promise<DatasetFile> {
  return JSON.parse(await readFile(join(dataDirectory, name), "utf8")) as DatasetFile;
}

function hashFeatures(values: number[]): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function packageVersion(lock: Record<string, unknown>, packageName: string): string {
  const packages = lock.packages as Record<string, { version?: string }> | undefined;
  return packages?.[`node_modules/${packageName}`]?.version ?? "unknown";
}

async function main() {
  // Training writes fresh metrics and predictions. Refuse to overwrite the one-shot
  // test record if it has already been appended.
  const metricsPath = join(modelDirectory, "metrics.json");
  const predictionsPath = join(modelDirectory, "predictions.csv");
  const [existingMetrics, existingPredictions] = await Promise.all([
    readFile(metricsPath, "utf8").catch(() => ""),
    readFile(predictionsPath, "utf8").catch(() => ""),
  ]);
  if ((existingMetrics && (JSON.parse(existingMetrics) as { test?: unknown }).test) || existingPredictions.split(/\r?\n/).some((row) => row.endsWith(",test"))) {
    throw new Error("Test results already exist; training would overwrite the single permitted test evaluation.");
  }
  const [train, validation] = await Promise.all([readDataset("train.json"), readDataset("val.json")]);
  if (!train.trainingStayDurations) throw new Error("train.json is missing the training-only stay-duration distribution.");
  const stayDurations = train.trainingStayDurations;
  const trainingVectors = train.samples.map((sample) => buildFeatureVector(sample, stayDurations));
  const validationVectors = validation.samples.map((sample) => buildFeatureVector(sample, stayDurations));
  const trainingLabels = train.samples.map((sample) => sample.label);
  const validationLabels = validation.samples.map((sample) => sample.label);

  let best: { fit: ReturnType<typeof fitLogisticRegression>; probabilities: number[]; metrics: ReturnType<typeof calculateMetrics> } | undefined;
  const trials: Array<{ lambda: number; validationBrier: number; validationLogLoss: number }> = [];
  for (const lambda of LAMBDA_CANDIDATES) {
    const fit = fitLogisticRegression(trainingVectors, trainingLabels, lambda);
    const probabilities = validationVectors.map((vector) => logisticProbabilityFromFit(vector, fit));
    const metrics = calculateMetrics(probabilities, validationLabels);
    trials.push({ lambda, validationBrier: metrics.brierScore, validationLogLoss: metrics.logLoss });
    if (!best || metrics.brierScore < best.metrics.brierScore) best = { fit, probabilities, metrics };
  }
  if (!best) throw new Error("No logistic regression model was fit.");

  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8")) as Record<string, unknown>;
  const model: LogisticModelArtifact = {
    modelType: "custom_l2_logistic_regression",
    featureOrder: [...FEATURE_ORDER],
    means: best.fit.means,
    standardDeviations: best.fit.standardDeviations,
    weights: best.fit.weights,
    intercept: best.fit.intercept,
    lambda: best.fit.lambda,
    trainingPeriod: { days: [1, 30], sampleCount: train.samples.length },
    seed: train.seed,
    trainingStayDurations: stayDurations,
    versions: { node: process.version, typescript: packageVersion(lock, "typescript"), tsx: packageVersion(lock, "tsx") },
  };
  const runtimeForecaster = createModelForecaster(model);
  const runtimeProbabilities = validation.samples.map((sample) => runtimeForecaster(sample));
  const maxRuntimeParityError = Math.max(...runtimeProbabilities.map((probability, index) => Math.abs(probability - best!.probabilities[index])));
  if (maxRuntimeParityError > 1e-12) throw new Error(`Runtime forecaster differs from training probability by ${maxRuntimeParityError}.`);

  const baselineProbabilities = validation.samples.map(baselineForecaster);
  const baselineMetrics = calculateMetrics(baselineProbabilities, validationLabels);
  const validationMetrics = calculateMetrics(best.probabilities, validationLabels);
  const metricsFile = {
    modelType: model.modelType,
    tuningSplit: "validation (days 31–40)",
    testEvaluation: "Not yet evaluated; see the test section after the single permitted post-freeze run.",
    logLossComparisonNote: "Log loss is not a fair comparison because the baseline outputs hard 0/1 probabilities.",
    selectedLambda: best.fit.lambda,
    lambdaTrials: trials,
    units: { probability: "P(free units at arrival >= k)", eta: "minutes", freeNow: "units", expectedReleases: "expected unit count" },
    validation: { sampleCount: validation.samples.length, model: validationMetrics, baseline: baselineMetrics, brierDifferenceModelMinusBaseline: validationMetrics.brierScore - baselineMetrics.brierScore },
    training: { sampleCount: train.samples.length, positiveCount: trainingLabels.filter((label) => label === 1).length, negativeCount: trainingLabels.filter((label) => label === 0).length },
    stayDistribution: Object.fromEntries(Object.entries(stayDurations).map(([type, values]) => [type, { count: values.length, units: "minutes", source: "completed stays admitted and released within training days 1–30" }])),
    parity: { savedVectors: Math.min(20, validation.samples.length), maxRuntimeParityError },
  };

  await mkdir(modelDirectory, { recursive: true });
  await writeFile(join(modelDirectory, "model.json"), `${JSON.stringify(model, null, 2)}\n`, "utf8");
  await writeFile(join(modelDirectory, "metrics.json"), `${JSON.stringify(metricsFile, null, 2)}\n`, "utf8");
  const parity = validation.samples.slice(0, 20).map((sample, index) => ({ id: sample.id, featureVector: validationVectors[index], probability: best!.probabilities[index] }));
  await writeFile(join(modelDirectory, "parity-vectors.json"), `${JSON.stringify(parity, null, 2)}\n`, "utf8");
  const predictionRows = validation.samples.map((sample, index) => `${sample.id},${hashFeatures(validationVectors[index])},${best!.probabilities[index]},${sample.label},validation`);
  await writeFile(join(modelDirectory, "predictions.csv"), `sample_id,features_hash,p,label,split\n${predictionRows.join("\n")}\n`, "utf8");

  console.log(`Trained custom L2 logistic regression on ${train.samples.length} training samples; selected lambda ${best.fit.lambda} using validation only.`);
  console.log(`Validation Brier: model ${validationMetrics.brierScore.toFixed(4)}, baseline ${baselineMetrics.brierScore.toFixed(4)}.`);
  console.log("Validation calibration (10 bins; mean predicted vs observed rate):");
  console.table(validationMetrics.calibration10Bins.map(({ bin, count, meanPrediction, observedRate }) => ({ bin, count, meanPrediction, observedRate })));
  console.log(`Accuracy: model ${validationMetrics.accuracyAtHalf.toFixed(3)}, baseline ${baselineMetrics.accuracyAtHalf.toFixed(3)}.`);
  console.log(`Log loss (not a fair comparison because the baseline outputs hard 0/1 probabilities): model ${validationMetrics.logLoss.toFixed(4)}, baseline ${baselineMetrics.logLoss.toFixed(4)}.`);
  console.log(`Runtime parity checked on ${parity.length} saved vectors (max difference ${maxRuntimeParityError}). Test metrics are intentionally not read by train.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
