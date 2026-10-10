import { logisticProbability } from "../allocation/forecaster.ts";
import { ACCEPTANCE_FEATURE_ORDER, type AcceptanceVector } from "../../sim/acceptance-world.ts";

export interface AcceptanceModelArtifact {
  modelType: "custom_l2_logistic_regression";
  featureOrder: string[];
  means: number[];
  standardDeviations: number[];
  weights: number[];
  intercept: number;
  lambda: number;
  trainingPeriod: { days: [number, number]; sampleCount: number };
  seed: number;
  parityVectors: Array<{ featureVector: number[]; probability: number }>;
}

export function scoreAcceptance(vector: AcceptanceVector, model: AcceptanceModelArtifact): number {
  if (model.featureOrder.join("\0") !== ACCEPTANCE_FEATURE_ORDER.join("\0") || vector.length !== model.weights.length || model.weights.length !== model.means.length || model.weights.length !== model.standardDeviations.length) {
    throw new RangeError("Acceptance model feature order does not match the runtime.");
  }
  let score = model.intercept;
  for (let index = 0; index < vector.length; index += 1) {
    if (!Number.isFinite(vector[index])) throw new RangeError("Acceptance feature value must be finite.");
    const deviation = model.standardDeviations[index] || 1;
    score += ((vector[index] - model.means[index]) / deviation) * model.weights[index];
  }
  const probability = logisticProbability(score);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError("Acceptance model returned invalid probability.");
  return probability;
}
