import { rankRequestSchema } from "./validation.ts";
import type { RankingHospital, RankingInput, RankingResult } from "./ranking.ts";

type IdLike = string | { toString(): string };
type HospitalRecord = {
  _id?: IdLike; id?: string; code?: string; name?: string;
  location?: { type?: "Point"; coordinates?: number[] };
  status?: string; responseRate?: number;
};
type ResourceRecord = {
  _id?: IdLike; id?: string; hospitalId: string; type: string; category: string;
  totalQuantity?: number; availableQuantity?: number; confirmedQuantity?: number;
  heldQuantity?: number; status?: string; updatedAt?: Date | string;
};
type DoctorRecord = { hospitalId: string; specialization: string; updatedAt?: Date | string };
type SettingsRecord = { weights?: { resource?: number; travel?: number; freshness?: number; availability?: number } } | null;
type RankData = { hospitals: HospitalRecord[]; resources: ResourceRecord[]; doctors: DoctorRecord[]; settings: SettingsRecord };
type Authorization = { authorized: boolean; reason?: string | null };

export type RankHandlerDependencies = {
  authorize: () => Promise<Authorization>;
  expirePendingHolds: () => Promise<unknown>;
  loadData: () => Promise<RankData>;
  addTravelTimes: (hospitals: RankingHospital[], origin: RankingInput["ambulanceLocation"]) => Promise<RankingHospital[]>;
  rankHospitals: (hospitals: RankingHospital[], input: RankingInput, options: { limit: number; weights: { resourceMatch: number; travelTime: number; freshness: number; availability: number } }) => RankingResult[];
};

const idString = (value: IdLike | undefined) => value?.toString();

export function createRankHandler(deps: RankHandlerDependencies) {
  return async function POST(request: Request) {
    const auth = await deps.authorize();
    if (!auth.authorized) return Response.json({ error: auth.reason ?? "FORBIDDEN" }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    const input = rankRequestSchema.safeParse(body);
    if (!input.success) return Response.json({ error: input.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") }, { status: 400 });

    try {
      await deps.expirePendingHolds();
      const { hospitals: hospitalDocuments, resources: resourceDocuments, doctors: doctorDocuments, settings } = await deps.loadData();
      const eligibleHospitals = [...new Map(hospitalDocuments.filter((hospital) => {
        const coordinates = hospital.location?.coordinates;
        const id = idString(hospital._id) ?? hospital.id ?? hospital.code;
        return Boolean(id && hospital.name?.trim() && coordinates && coordinates.length === 2 && coordinates.every(Number.isFinite));
      }).map((hospital) => [idString(hospital._id) ?? hospital.id ?? hospital.code!, hospital])).values()];
      const rankingHospitals = eligibleHospitals.map((hospital) => {
        const hospitalId = idString(hospital._id) ?? hospital.id ?? hospital.code!;
        const resources = resourceDocuments.filter((resource) => resource.hospitalId === hospitalId || resource.hospitalId === hospital.code).map((resource) => ({
          id: idString(resource._id) ?? resource.id ?? "", type: resource.type, category: resource.category,
          totalQuantity: resource.totalQuantity,
          availableQuantity: resource.status === "unavailable" ? 0 : Math.max(0, resource.type === "bed"
            ? Math.min(resource.availableQuantity ?? 0, (resource.totalQuantity ?? 0) - (resource.confirmedQuantity ?? 0) - (resource.heldQuantity ?? 0))
            : (resource.availableQuantity ?? 0) - (resource.heldQuantity ?? 0)), updatedAt: resource.updatedAt,
        }));
        const doctors = doctorDocuments.filter((doctor) => doctor.hospitalId === hospitalId || doctor.hospitalId === hospital.code).map((doctor) => ({
          id: "", type: "specialist" as const, category: doctor.specialization, totalQuantity: 1, availableQuantity: 1, updatedAt: doctor.updatedAt,
        }));
        return {
          id: hospitalId, name: hospital.name!,
          location: { type: "Point" as const, coordinates: hospital.location!.coordinates as [number, number] },
          status: hospital.status!, resources: [...resources, ...doctors], responseRate: hospital.responseRate,
        };
      });
      const withTravelTimes = await deps.addTravelTimes(rankingHospitals, input.data.ambulanceLocation);
      const configuredWeights = settings?.weights;
      const legacyWeightTotal = [configuredWeights?.resource, configuredWeights?.travel, configuredWeights?.freshness]
        .reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
      const normalizedConfigured = configuredWeights && configuredWeights.availability === undefined && legacyWeightTotal > 0
        ? {
            resourceMatch: (configuredWeights.resource ?? 0) / legacyWeightTotal * 90,
            travelTime: (configuredWeights.travel ?? 0) / legacyWeightTotal * 90,
            freshness: (configuredWeights.freshness ?? 0) / legacyWeightTotal * 90,
            availability: 10,
          }
        : configuredWeights ? {
            resourceMatch: configuredWeights.resource,
            travelTime: configuredWeights.travel,
            freshness: configuredWeights.freshness,
            availability: configuredWeights.availability,
          } : null;
      const configuredValues = normalizedConfigured ? Object.values(normalizedConfigured) : [];
      const configuredTotal = configuredValues.reduce<number>((sum, value) => sum + (typeof value === "number" ? value : Number.NaN), 0);
      const hasValidWeights = configuredValues.length === 4 && configuredValues.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0) && Number.isFinite(configuredTotal) && configuredTotal > 0;
      const balancedWeights = hasValidWeights
        ? normalizedConfigured as { resourceMatch: number; travelTime: number; freshness: number; availability: number }
        : { resourceMatch: 45, travelTime: 25, freshness: 20, availability: 10 };
      const scoringWeights = input.data.priority === "resources"
        ? { resourceMatch: 63, travelTime: 13.5, freshness: 13.5, availability: 10 }
        : input.data.priority === "travel"
          ? { resourceMatch: 18, travelTime: 58.5, freshness: 13.5, availability: 10 }
          : input.data.priority === "freshness"
            ? { resourceMatch: 22.5, travelTime: 18, freshness: 49.5, availability: 10 }
            : balancedWeights;
      const weightTotal = Object.values(scoringWeights).reduce((sum, weight) => sum + weight, 0);
      const displayedWeights = Object.fromEntries(Object.entries(scoringWeights).map(([key, weight]) => [key, Math.round(weight / weightTotal * 10000) / 100]));
      const ranked = deps.rankHospitals(withTravelTimes, input.data, { limit: 100, weights: scoringWeights });
      const resourceMap = new Map(rankingHospitals.map((hospital) => [hospital.id, hospital.resources]));
      const filtered = ranked
        .filter((item) => item.travelTimeMinutes === null || item.travelTimeMinutes <= (input.data.maxTravelMinutes ?? 240))
        .slice(0, input.data.limit ?? 100);
      const withDetails = filtered.map((item) => {
        const hospital = eligibleHospitals.find((candidate) => (idString(candidate._id) ?? candidate.id ?? candidate.code) === item.hospitalId);
        const raw = resourceMap.get(item.hospitalId) ?? [];
        const [longitude, latitude] = hospital?.location?.coordinates ?? [0, 0];
        const lat1 = input.data.ambulanceLocation.latitude * Math.PI / 180;
        const lat2 = latitude * Math.PI / 180;
        const dLat = lat2 - lat1;
        const dLon = (longitude - input.data.ambulanceLocation.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return {
          ...item,
          distanceKm: Math.round(6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10,
          resources: raw.map((resource) => ({ id: resource.id, type: resource.type, category: resource.category, totalQuantity: resource.totalQuantity, availableQuantity: resource.availableQuantity })),
        };
      });
      return Response.json({ emergencyType: input.data.emergencyType, rankingWeights: displayedWeights, ranked: withDetails });
    } catch {
      return Response.json({ error: "Failed to rank hospitals." }, { status: 500 });
    }
  };
}
