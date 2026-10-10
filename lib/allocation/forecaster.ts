import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFeatureVector, FEATURE_ORDER, type FeatureVector, type TrainingStayDurations } from "../../sim/features.ts";
import type { DecisionSample } from "../../sim/world.ts";

export interface LogisticModelArtifact {
  modelType: "custom_l2_logistic_regression";
  featureOrder: string[];
  means: number[];
  standardDeviations: number[];
  weights: number[];
  intercept: number;
  lambda: number;
  trainingPeriod: { days: [number, number]; sampleCount: number };
  seed: number;
  trainingStayDurations: TrainingStayDurations;
  versions: { node: string; typescript: string; tsx: string };
}

export type ResourceAvailabilityForecaster = (sample: DecisionSample) => number;

export function logisticProbability(score: number): number {
  if (score >= 0) return 1 / (1 + Math.exp(-Math.min(score, 40)));
  const exponential = Math.exp(Math.max(score, -40));
  return exponential / (1 + exponential);
}

export function probabilityFromFeatureVector(vector: FeatureVector, model: LogisticModelArtifact): number {
  if (vector.length !== model.weights.length || vector.length !== model.means.length || vector.length !== model.standardDeviations.length) {
    throw new RangeError("Feature vector does not match the saved model feature order.");
  }
  let score = model.intercept;
  for (let index = 0; index < vector.length; index += 1) {
    const standardDeviation = model.standardDeviations[index] || 1;
    score += ((vector[index] - model.means[index]) / standardDeviation) * model.weights[index];
  }
  return logisticProbability(score);
}

export function createModelForecaster(model: LogisticModelArtifact): ResourceAvailabilityForecaster {
  if (model.featureOrder.join("\0") !== FEATURE_ORDER.join("\0")) throw new Error("Saved model feature order does not match this runtime.");
  return (sample) => probabilityFromFeatureVector(buildFeatureVector(sample, model.trainingStayDurations), model);
}

export function loadModelForecaster(path = join(process.cwd(), "model", "model.json")): ResourceAvailabilityForecaster {
  const model = JSON.parse(readFileSync(path, "utf8")) as LogisticModelArtifact;
  return createModelForecaster(model);
}
