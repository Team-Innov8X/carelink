import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fitLogisticRegression, logisticProbabilityFromFit } from "./logistic.ts";
import { calculateMetrics } from "./metrics.ts";
import { ACCEPTANCE_FEATURE_ORDER, type AcceptanceSample } from "./acceptance-world.ts";
import { scoreAcceptance, type AcceptanceModelArtifact } from "../lib/recommend/accept-model.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
type Dataset = { seed: number; split: string; days: [number, number]; samples: AcceptanceSample[] };
async function read(name: string): Promise<Dataset> { return JSON.parse(await readFile(join(root, "data/synthetic/acceptance", name), "utf8")) as Dataset; }

async function main() {
  await access(join(root, "evidence/rec/accept-test-evaluated.json")).then(() => { throw new Error("Test evaluation already exists; do not retrain after opening the holdout."); }).catch((error: unknown) => { if (error instanceof Error && error.message.startsWith("Test evaluation")) throw error; });
  const [train, validation] = await Promise.all([read("train.json"), read("val.json")]);
  if (train.split !== "train" || validation.split !== "validation" || train.days[0] !== 1 || train.days[1] !== 30 || validation.days[0] !== 31 || validation.days[1] !== 40) throw new Error("Acceptance training requires days 1–30 and validation requires days 31–40.");
  const vectors = train.samples.map((sample) => sample.features);
  const labels = train.samples.map((sample) => sample.label);
  const validationVectors = validation.samples.map((sample) => sample.features);
  const validationLabels = validation.samples.map((sample) => sample.label);
  const trials = [0.001, 0.01, 0.1, 1, 10];
  let best: { fit: ReturnType<typeof fitLogisticRegression>; probabilities: number[]; brier: number } | undefined;
  const lambdaTrials = [] as Array<{ lambda: number; validationBrier: number }>;
  for (const lambda of trials) {
    const fit = fitLogisticRegression(vectors, labels, lambda, 900, 0.06);
    const probabilities = validationVectors.map((vector) => logisticProbabilityFromFit(vector, fit));
    const brier = calculateMetrics(probabilities, validationLabels).brierScore;
    lambdaTrials.push({ lambda, validationBrier: brier });
    if (!best || brier < best.brier) best = { fit, probabilities, brier };
  }
  if (!best) throw new Error("No acceptance model fit was produced.");
  const parityVectors = validationVectors.slice(0, 20).map((featureVector, index) => ({ featureVector, probability: best!.probabilities[index] }));
  const model: AcceptanceModelArtifact = {
    modelType: "custom_l2_logistic_regression", featureOrder: [...ACCEPTANCE_FEATURE_ORDER], means: best.fit.means,
    standardDeviations: best.fit.standardDeviations, weights: best.fit.weights, intercept: best.fit.intercept,
    lambda: best.fit.lambda, trainingPeriod: { days: [1, 30], sampleCount: train.samples.length }, seed: train.seed, parityVectors,
  };
  const runtimeParity = parityVectors.map((row) => Math.abs(scoreAcceptance(row.featureVector, model) - row.probability));
  const maxParityError = Math.max(...runtimeParity);
  if (maxParityError > 1e-12) throw new Error(`Runtime scorer mismatch: ${maxParityError}`);
  const validationMetrics = calculateMetrics(best.probabilities, validationLabels);
  const baselineMetrics = calculateMetrics(validationLabels.map(() => 1), validationLabels);
  const modelDirectory = join(root, "model");
  await mkdir(modelDirectory, { recursive: true });
  await writeFile(join(modelDirectory, "accept-model.json"), `${JSON.stringify(model, null, 2)}\n`, "utf8");
  await writeFile(join(modelDirectory, "accept-metrics.json"), `${JSON.stringify({
    modelType: model.modelType, tuningSplit: "validation (days 31–40)", testEvaluation: "Not yet evaluated; first test run is allowed only after rec-pre-test.",
    baseline: "Nearest-feasible policy baseline represented by p_accept=1 at the chosen nearest feasible candidate; log loss is unfair to this hard 0/1 baseline.",
    selectedLambda: best.fit.lambda, lambdaTrials, validation: { model: validationMetrics, nearestFeasibleBaseline: baselineMetrics, brierDifferenceModelMinusBaseline: validationMetrics.brierScore - baselineMetrics.brierScore },
    training: { sampleCount: train.samples.length, positiveCount: labels.filter((label) => label === 1).length, negativeCount: labels.filter((label) => label === 0).length },
    parity: { savedVectors: parityVectors.length, maxRuntimeParityError: maxParityError },
    syntheticDataOnly: true,
  }, null, 2)}\n`, "utf8");
  const csv = validation.samples.map((sample, index) => `${sample.id},${sample.day},${best!.probabilities[index]},${sample.label},validation`).join("\n");
  await writeFile(join(modelDirectory, "accept-predictions.csv"), `sample_id,day,p_accept,label,split\n${csv}\n`, "utf8");
  console.log(`Acceptance model: ${train.samples.length} training examples; ${validation.samples.length} validation examples; lambda=${best.fit.lambda}.`);
  console.log(`Validation Brier: model ${validationMetrics.brierScore.toFixed(4)}, nearest-feasible baseline ${baselineMetrics.brierScore.toFixed(4)}; accuracy ${validationMetrics.accuracyAtHalf.toFixed(3)}; 20-vector parity error ${maxParityError}.`);
  console.log("Validation calibration (10 bins):");
  console.table(validationMetrics.calibration10Bins.map(({ bin, count, meanPrediction, observedRate }) => ({ bin, count, meanPrediction, observedRate })));
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
