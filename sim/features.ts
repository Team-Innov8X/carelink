import type { DecisionSample, ResourceType } from "./world.ts";

export const FEATURE_ORDER = [
  "free_now",
  "free_now_minus_k",
  "k",
  "occupancy_ratio",
  "eta_min",
  "walk_ins_last_30_min",
  "expected_releases_within_eta",
  "hour_sin",
  "hour_cos",
  "weekend",
  "resource_type_is_icu",
] as const;

export type FeatureName = (typeof FEATURE_ORDER)[number];
export type FeatureVector = number[];
export type TrainingStayDurations = Record<ResourceType, number[]>;

function upperBound(sortedValues: number[], target: number): number {
  let low = 0;
  let high = sortedValues.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (sortedValues[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function expectedReleasesWithinEta(elapsedMinutes: number[], trainingStayDurations: number[], etaMinutes: number): number {
  if (trainingStayDurations.length === 0) return 0;
  let expected = 0;
  for (const elapsed of elapsedMinutes) {
    const alreadyReleased = upperBound(trainingStayDurations, elapsed);
    const atArrival = upperBound(trainingStayDurations, elapsed + etaMinutes);
    const stillOccupied = trainingStayDurations.length - alreadyReleased;
    if (stillOccupied > 0) expected += (atArrival - alreadyReleased) / stillOccupied;
  }
  return expected;
}

/** Uses only the sample's decision-time observation and training-period stay durations. */
export function buildFeatureVector(sample: DecisionSample, stayDurations: TrainingStayDurations): FeatureVector {
  const source = sample.features;
  const expectedReleases = expectedReleasesWithinEta(
    source.currentStayElapsedMinutes,
    stayDurations[sample.resourceType],
    sample.etaMin,
  );
  const hourAngle = (2 * Math.PI * source.hour) / 24;
  const featureValues: Record<FeatureName, number> = {
    free_now: source.freeNow,
    free_now_minus_k: source.freeNowMinusK,
    k: source.k,
    occupancy_ratio: source.occupancyRatio,
    eta_min: source.etaMin,
    walk_ins_last_30_min: source.walkInsLast30Min,
    expected_releases_within_eta: expectedReleases,
    hour_sin: Math.sin(hourAngle),
    hour_cos: Math.cos(hourAngle),
    weekend: source.weekend,
    resource_type_is_icu: source.resourceTypeIsIcu,
  };
  return FEATURE_ORDER.map((name) => featureValues[name]);
}

export function buildFeatureVectors(samples: DecisionSample[], stayDurations: TrainingStayDurations): FeatureVector[] {
  return samples.map((sample) => buildFeatureVector(sample, stayDurations));
}
