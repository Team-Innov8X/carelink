/**
 * Pure hospital ranking logic. Route durations should be supplied by the caller
 * (for example, from Google Routes); this module makes no network or DB calls.
 */

export interface AmbulanceLocation {
  latitude: number;
  longitude: number;
}

export interface EmergencyType {
  /** Resource categories required for this emergency, e.g. ["icu", "ventilator"]. */
  requiredResources: string[];
}

export interface RankingResource {
  category: string;
  availableQuantity: number;
  updatedAt: Date | string;
}

export interface RankingHospital {
  id: string;
  name: string;
  resources: RankingResource[];
  /** Route duration in minutes, populated from a routing provider when available. */
  travelTimeMinutes?: number;
  /** Rolling proportion of requests accepted, from 0 to 1. Omit when unavailable. */
  responseRate?: number;
}

export interface RankingWeights {
  match: number;
  travel: number;
  freshness: number;
  reliability: number;
}

export interface ScoreBreakdown {
  resourceMatchScore: number;
  travelTimeScore: number;
  dataFreshnessScore: number;
  hospitalResponseRate: number | null;
}

export interface RankedHospital {
  hospital: RankingHospital;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface RankingOptions {
  weights?: Partial<RankingWeights>;
  /** Injectable route-time lookup. Useful for fakes and for async API calls upstream. */
  travelTimeMinutes?: (hospital: RankingHospital, ambulanceLocation: AmbulanceLocation) => number | undefined;
  now?: Date;
  maxTravelMinutes?: number;
  freshnessHalfLifeHours?: number;
  limit?: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  match: 0.5,
  travel: 0.25,
  freshness: 0.15,
  reliability: 0.1,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function freshnessScore(updatedAt: Date | string, now: Date, halfLifeHours: number): number {
  const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return 0;
  const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
  return Math.pow(0.5, ageHours / halfLifeHours);
}

function resourceMatchScore(hospital: RankingHospital, emergencyType: EmergencyType): number {
  const required = [...new Set(emergencyType.requiredResources.map((category) => category.toLowerCase()))];
  if (required.length === 0) return 1;

  const availableCategories = new Set(
    hospital.resources
      .filter((resource) => resource.availableQuantity > 0)
      .map((resource) => resource.category.toLowerCase()),
  );
  return required.filter((category) => availableCategories.has(category)).length / required.length;
}

function travelScore(minutes: number | undefined, maxTravelMinutes: number): number {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return 0;
  return clamp01(1 - minutes / maxTravelMinutes);
}

/** Score one hospital on a 0–100 scale. No Maps calls are made here. */
export function score(
  hospital: RankingHospital,
  emergencyType: EmergencyType,
  ambulanceLocation: AmbulanceLocation,
  options: RankingOptions = {},
): RankedHospital {
  const now = options.now ?? new Date();
  const maxTravelMinutes = options.maxTravelMinutes ?? 60;
  const halfLifeHours = options.freshnessHalfLifeHours ?? 6;
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

  if (Object.values(weights).some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError("Ranking weights must be finite and non-negative.");
  }
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) throw new RangeError("At least one ranking weight must be greater than zero.");
  if (maxTravelMinutes <= 0 || halfLifeHours <= 0) {
    throw new RangeError("Travel limit and freshness half-life must be greater than zero.");
  }

  const resourceScore = resourceMatchScore(hospital, emergencyType);
  const routeMinutes = options.travelTimeMinutes
    ? options.travelTimeMinutes(hospital, ambulanceLocation)
    : hospital.travelTimeMinutes;
  const travelTimeScore = travelScore(routeMinutes, maxTravelMinutes);
  const dataFreshnessScore = hospital.resources.length === 0
    ? 0
    : hospital.resources.reduce(
        (sum, resource) => sum + freshnessScore(resource.updatedAt, now, halfLifeHours),
        0,
      ) / hospital.resources.length;
  const hospitalResponseRate = hospital.responseRate === undefined
    ? null
    : clamp01(hospital.responseRate);

  // If reliability is unknown, omit that term and renormalize the remaining weights.
  const activeWeight = totalWeight - (hospitalResponseRate === null ? weights.reliability : 0);
  const weightedScore =
    resourceScore * weights.match +
    travelTimeScore * weights.travel +
    dataFreshnessScore * weights.freshness +
    (hospitalResponseRate ?? 0) * weights.reliability;

  return {
    hospital,
    score: Math.round((weightedScore / activeWeight) * 10000) / 100,
    breakdown: {
      resourceMatchScore: resourceScore,
      travelTimeScore,
      dataFreshnessScore,
      hospitalResponseRate,
    },
  };
}

/** Return the highest scoring candidates, limited to a shortlist of three by default. */
export function rankHospitals(
  hospitals: RankingHospital[],
  emergencyType: EmergencyType,
  ambulanceLocation: AmbulanceLocation,
  options: RankingOptions = {},
): RankedHospital[] {
  const limit = Math.max(0, Math.min(3, Math.floor(options.limit ?? 3)));
  return hospitals
    .map((hospital) => score(hospital, emergencyType, ambulanceLocation, options))
    .sort((a, b) => b.score - a.score || a.hospital.id.localeCompare(b.hospital.id))
    .slice(0, limit);
}
