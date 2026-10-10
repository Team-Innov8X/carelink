/** Tunable recommendation and request-flow values. Freeze before test evaluation. */
export const RECOMMENDATION = {
  maxTravelMin: 60,
  reroutePenaltyMin: 25,
  rejectPenaltyMin: 20,
  experienceBonus: 3,
  maxReroutes: 2,
  hospitalResponseSeconds: 90,
  recentRejectionWindowMinutes: 60,
  simulationSeed: 20261011,
  bootstrapSeed: 20261021,
  bootstrapResamples: 1000,
  emergencyFallbackText: "Call local emergency services and the nearest suitable hospital for current capacity.",
} as const;
