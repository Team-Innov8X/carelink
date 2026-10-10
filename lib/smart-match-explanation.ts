type ExplanationInput = {
  score: number;
  travelTimeMinutes: number | null;
  distanceKm: number;
  matchedResources: string[];
  missingResources: string[];
  scoreBreakdown: { resourceMatch: number; travelTime: number; freshness: number; availability: number };
  scoreContributions: { resourceMatch: number; travelTime: number; freshness: number; availability: number; statusPenalty: number };
};

/** Builds user-facing reasons only from the rank API's retrieved facts and calculated values. */
export function buildMatchExplanation(result: ExplanationInput) {
  const resource = Math.round(result.scoreBreakdown.resourceMatch * 100);
  const travel = Math.round(result.scoreBreakdown.travelTime * 100);
  const freshness = Math.round(result.scoreBreakdown.freshness * 100);
  const availability = Math.round(result.scoreBreakdown.availability * 100);
  const matched = result.matchedResources.length
    ? `Available matching needs: ${result.matchedResources.join(", ")}.`
    : "No requested specialties or equipment were found available in current inventory.";
  const missing = result.missingResources.length
    ? ` Missing or unavailable: ${result.missingResources.join(", ")}.`
    : " All listed requirements matched.";
  const eta = result.travelTimeMinutes == null
    ? "Travel time was unavailable."
    : `Estimated travel is ${Math.ceil(result.travelTimeMinutes)} minutes (${result.distanceKm} km).`;
  const points = result.scoreContributions;
  return `${matched}${missing} ${eta} Factor values: resource fit ${resource}%, travel fit ${travel}%, data freshness ${freshness}%, relevant available capacity ${availability}%. Weighted score points: resources ${points.resourceMatch.toFixed(1)}, travel ${points.travelTime.toFixed(1)}, freshness ${points.freshness.toFixed(1)}, availability ${points.availability.toFixed(1)}; status deduction ${points.statusPenalty.toFixed(1)}. These deterministic criteria produce ${result.score.toFixed(2)}/100; this is not an AI prediction.`;
}
