/** Allocation policy constants. Keep these fixed before any test-day replay. */
export const REROUTE_PENALTY_MIN = 25;
export const ETA_REPLAN_THRESHOLD_MIN = 10;
export const MAX_REROUTES_PER_PATIENT = 2;
export const URGENCY_WEIGHT: Readonly<Record<1 | 2 | 3, number>> = { 1: 100, 2: 10, 3: 1 };
