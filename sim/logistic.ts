import type { FeatureVector } from "./features.ts";

export interface Standardizer { means: number[]; standardDeviations: number[] }
export interface LogisticFit extends Standardizer { weights: number[]; intercept: number; lambda: number; iterations: number }

export function fitStandardizer(vectors: FeatureVector[]): Standardizer {
  if (vectors.length === 0) throw new RangeError("Cannot standardize an empty feature set.");
  const width = vectors[0].length;
  const means = Array.from({ length: width }, (_, column) => vectors.reduce((sum, row) => sum + row[column], 0) / vectors.length);
  const standardDeviations = Array.from({ length: width }, (_, column) => {
    const variance = vectors.reduce((sum, row) => sum + (row[column] - means[column]) ** 2, 0) / vectors.length;
    return variance > 1e-12 ? Math.sqrt(variance) : 1;
  });
  return { means, standardDeviations };
}

export function standardizeVector(vector: FeatureVector, standardizer: Standardizer): FeatureVector {
  return vector.map((value, index) => (value - standardizer.means[index]) / standardizer.standardDeviations[index]);
}

export function standardizeVectors(vectors: FeatureVector[], standardizer: Standardizer): FeatureVector[] {
  return vectors.map((vector) => standardizeVector(vector, standardizer));
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-Math.min(value, 40)));
  const exponential = Math.exp(Math.max(value, -40));
  return exponential / (1 + exponential);
}

/** Fixed-step batch gradient descent with an L2 penalty; intercept is not regularized. */
export function fitLogisticRegression(vectors: FeatureVector[], labels: number[], lambda: number, iterations = 700, learningRate = 0.08): LogisticFit {
  if (vectors.length === 0 || vectors.length !== labels.length) throw new RangeError("Feature and label counts must be equal and non-zero.");
  const standardizer = fitStandardizer(vectors);
  const normalized = standardizeVectors(vectors, standardizer);
  const width = normalized[0].length;
  const weights = Array.from({ length: width }, () => 0);
  let intercept = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradients = Array.from({ length: width }, () => 0);
    let interceptGradient = 0;
    for (let row = 0; row < normalized.length; row += 1) {
      let score = intercept;
      for (let column = 0; column < width; column += 1) score += normalized[row][column] * weights[column];
      const error = sigmoid(score) - labels[row];
      interceptGradient += error;
      for (let column = 0; column < width; column += 1) gradients[column] += error * normalized[row][column];
    }
    intercept -= learningRate * interceptGradient / normalized.length;
    for (let column = 0; column < width; column += 1) {
      const gradient = gradients[column] / normalized.length + lambda * weights[column];
      weights[column] -= learningRate * gradient;
    }
  }
  return { ...standardizer, weights, intercept, lambda, iterations };
}

export function logisticProbabilityFromFit(vector: FeatureVector, fit: LogisticFit): number {
  const normalized = standardizeVector(vector, fit);
  let score = fit.intercept;
  for (let index = 0; index < normalized.length; index += 1) score += normalized[index] * fit.weights[index];
  return sigmoid(score);
}
