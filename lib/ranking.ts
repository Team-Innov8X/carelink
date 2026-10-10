export interface RankingResource { category: string; availableQuantity: number; updatedAt: Date | string }
export interface RankingHospital {
  id: string;
  name: string;
  location: { type: "Point"; coordinates: [number, number] };
  status: string;
  resources: RankingResource[];
  travelTimeMinutes?: number;
}
export interface RankingInput { emergencyType: string; requiredResources?: string[]; ambulanceLocation: { latitude: number; longitude: number } }
export interface RankingResult {
  hospitalId: string; name: string; score: number; travelTimeMinutes: number | null;
  scoreBreakdown: { resourceMatch: number; travelTime: number; freshness: number; availability: number };
  matchedResources: string[]; status: string;
}

const DEFAULT_NEEDS: Record<string, string[]> = {
  cardiac: ["cardiologist", "defibrillator", "icu"], heart_attack: ["cardiologist", "defibrillator", "icu"],
  trauma: ["trauma_surgeon", "emergency", "icu"], accident: ["trauma_surgeon", "emergency", "icu"],
  respiratory: ["ventilator", "oxygen_cylinder", "icu"], stroke: ["neurologist", "icu"], pediatric: ["pediatrician", "pediatric"],
};
const normalize = (value: string) => value.trim().toLowerCase().replace(/[ -]+/g, "_");

export function rankHospitals(
  hospitals: RankingHospital[], input: RankingInput,
  options: { now?: Date; limit?: number; weights?: { resourceMatch: number; travelTime: number; freshness: number; availability: number } } = {},
): RankingResult[] {
  const weights = options.weights ?? { resourceMatch: 0.5, travelTime: 0.25, freshness: 0.15, availability: 0.1 };
  const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (Object.values(weights).some((value) => !Number.isFinite(value) || value < 0) || weightTotal <= 0) throw new RangeError("Ranking weights must be non-negative and have a positive sum.");
  const needs = [...new Set((input.requiredResources?.length ? input.requiredResources : DEFAULT_NEEDS[normalize(input.emergencyType)] ?? [input.emergencyType]).map(normalize))];
  const now = options.now ?? new Date();
  return hospitals.map((hospital) => {
    const available = hospital.resources.filter((resource) => resource.availableQuantity > 0);
    const matched = needs.filter((need) => available.some((resource) => normalize(resource.category) === need));
    const resourceMatch = needs.length ? matched.length / needs.length : 1;
    const travelTime = hospital.travelTimeMinutes == null ? 0 : Math.max(0, Math.min(1, 1 - hospital.travelTimeMinutes / 60));
    const freshness = hospital.resources.length ? hospital.resources.reduce((sum, resource) => {
      const timestamp = resource.updatedAt instanceof Date ? resource.updatedAt.getTime() : Date.parse(resource.updatedAt);
      const ageHours = Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / 3_600_000) : Infinity;
      return sum + 2 ** (-ageHours / 6);
    }, 0) / hospital.resources.length : 0;
    const availability = Math.min(1, available.reduce((sum, resource) => sum + resource.availableQuantity, 0) / 10);
    const statusFactor = hospital.status === "active" ? 1 : hospital.status === "busy" ? 0.8 : 0;
    const scoreBreakdown = { resourceMatch, travelTime, freshness, availability };
    const score = Math.round((Object.entries(weights).reduce((sum, [key, weight]) => sum + scoreBreakdown[key as keyof typeof scoreBreakdown] * weight, 0) / weightTotal) * statusFactor * 10000) / 100;
    return { hospitalId: hospital.id, name: hospital.name, score, travelTimeMinutes: hospital.travelTimeMinutes ?? null, scoreBreakdown, matchedResources: matched, status: hospital.status };
  }).filter((item) => item.status === "active" || item.status === "busy")
    .sort((a, b) => b.score - a.score || (a.travelTimeMinutes ?? Infinity) - (b.travelTimeMinutes ?? Infinity) || a.name.localeCompare(b.name))
    .slice(0, Math.min(3, Math.max(0, options.limit ?? 3)));
}

/** Uses Google Routes when configured; falls back to deterministic straight-line ETA estimates. */
export async function addTravelTimes(
  hospitals: RankingHospital[], origin: RankingInput["ambulanceLocation"],
): Promise<RankingHospital[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || hospitals.length === 0) return hospitals.map((hospital) => ({ ...hospital, travelTimeMinutes: estimateMinutes(origin, hospital.location.coordinates) }));
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRouteMatrix", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition" },
      body: JSON.stringify({
        origins: [{ waypoint: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } } }],
        destinations: hospitals.map((hospital) => ({
          waypoint: { location: { latLng: { latitude: hospital.location.coordinates[1], longitude: hospital.location.coordinates[0] } } },
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Routes API request failed");
    const rows = await response.json() as Array<{ destinationIndex: number; duration?: string; condition?: string }>;
    const times = new Map(rows.map((row) => [row.destinationIndex, row.condition === "ROUTE_EXISTS" && row.duration ? Number.parseFloat(row.duration) / 60 : undefined]));
    return hospitals.map((hospital, index) => ({ ...hospital, travelTimeMinutes: times.get(index) ?? estimateMinutes(origin, hospital.location.coordinates) }));
  } catch {
    return hospitals.map((hospital) => ({ ...hospital, travelTimeMinutes: estimateMinutes(origin, hospital.location.coordinates) }));
  }
}

function estimateMinutes(origin: RankingInput["ambulanceLocation"], destination: [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const [longitude, latitude] = destination;
  const latDiff = radians(latitude - origin.latitude); const lngDiff = radians(longitude - origin.longitude);
  const a = Math.sin(latDiff / 2) ** 2 + Math.cos(radians(origin.latitude)) * Math.cos(radians(latitude)) * Math.sin(lngDiff / 2) ** 2;
  const km = 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(km / 0.5 * 10) / 10;
}
