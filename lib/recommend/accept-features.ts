import conditions from "../../data/conditions.json";

export const ACCEPTANCE_FEATURE_ORDER = [
  "free_now", "occupancy_ratio", "recent_rejection_rate", "walk_ins_last_30_min", "urgency",
  ...conditions.map((condition) => `condition_${condition.id}`), "capability_match", "eta_min", "capacity",
  "hour_sin", "hour_cos", "weekend",
] as const;

export function buildAcceptanceFeatures(input: {
  freeNow: number; occupancyRatio: number; recentRejectionRate: number; walkInsLast30Min: number;
  urgency: number; conditionId: string; capabilityMatch: boolean; etaMin: number; capacity: number; at: Date;
}): number[] {
  const hour = input.at.getHours() + input.at.getMinutes() / 60;
  return [
    input.freeNow, input.occupancyRatio, input.recentRejectionRate, input.walkInsLast30Min, input.urgency,
    ...conditions.map((condition) => condition.id === input.conditionId ? 1 : 0),
    input.capabilityMatch ? 1 : 0, input.etaMin, input.capacity,
    Math.sin((2 * Math.PI * hour) / 24), Math.cos((2 * Math.PI * hour) / 24), input.at.getDay() === 0 || input.at.getDay() === 6 ? 1 : 0,
  ];
}
