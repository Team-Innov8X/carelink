import { createRng } from "./world.ts";

export interface CalibrationBin { bin: number; count: number; meanPrediction: number | null; observedRate: number | null }
export interface ForecastMetrics {
  count: number;
  positiveCount: number;
  negativeCount: number;
  positiveRate: number;
  brierScore: number;
  logLoss: number;
  accuracyAtHalf: number;
  calibration10Bins: CalibrationBin[];
}

export function calculateMetrics(probabilities: number[], labels: number[]): ForecastMetrics {
  if (probabilities.length === 0 || probabilities.length !== labels.length) throw new RangeError("Probabilities and labels must have equal non-zero length.");
  const bins = Array.from({ length: 10 }, (_, bin) => ({ bin, count: 0, predictions: 0, positives: 0 }));
  let brierSum = 0;
  let logLossSum = 0;
  let correct = 0;
  let positiveCount = 0;
  for (let index = 0; index < probabilities.length; index += 1) {
    const probability = Math.min(1, Math.max(0, probabilities[index]));
    const label = labels[index];
    const difference = probability - label;
    brierSum += difference * difference;
    logLossSum -= label === 1 ? Math.log(Math.max(probability, 1e-15)) : Math.log(Math.max(1 - probability, 1e-15));
    if ((probability >= 0.5 ? 1 : 0) === label) correct += 1;
    if (label === 1) positiveCount += 1;
    const binIndex = Math.min(9, Math.floor(probability * 10));
    bins[binIndex].count += 1;
    bins[binIndex].predictions += probability;
    bins[binIndex].positives += label;
  }
  return {
    count: labels.length,
    positiveCount,
    negativeCount: labels.length - positiveCount,
    positiveRate: positiveCount / labels.length,
    brierScore: brierSum / labels.length,
    logLoss: logLossSum / labels.length,
    accuracyAtHalf: correct / labels.length,
    calibration10Bins: bins.map(({ bin, count, predictions, positives }) => ({
      bin,
      count,
      meanPrediction: count ? predictions / count : null,
      observedRate: count ? positives / count : null,
    })),
  };
}

export function pairedBrierDifferenceInterval(modelProbabilities: number[], baselineProbabilities: number[], labels: number[], seed: number, resamples = 1000): { estimate: number; lower95: number; upper95: number; resamples: number; seed: number } {
  if (modelProbabilities.length !== baselineProbabilities.length || labels.length !== modelProbabilities.length || labels.length === 0) {
    throw new RangeError("Paired bootstrap inputs must have equal non-zero length.");
  }
  const differences = labels.map((label, index) => (modelProbabilities[index] - label) ** 2 - (baselineProbabilities[index] - label) ** 2);
  const estimate = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  const random = createRng(seed);
  const distribution = Array.from({ length: resamples }, () => {
    let total = 0;
    for (let draw = 0; draw < differences.length; draw += 1) total += differences[Math.floor(random() * differences.length)];
    return total / differences.length;
  }).sort((a, b) => a - b);
  return {
    estimate,
    lower95: distribution[Math.floor(0.025 * (resamples - 1))],
    upper95: distribution[Math.floor(0.975 * (resamples - 1))],
    resamples,
    seed,
  };
}
