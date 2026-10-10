import { ObjectId } from "mongodb";
import { getDoctorsCollection, getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import clientPromise from "@/lib/mongodb";
import { addTravelTimes, rankHospitals } from "@/lib/ranking";
import { rankRequestSchema } from "@/lib/validation";
import { expirePendingHolds } from "@/lib/services/hold-service";
import type { z } from "zod";

type Criteria = z.infer<typeof rankRequestSchema>;
const isoDate = (value: unknown) => {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

/** Rebuilds explanation facts from database records; client-supplied result text is never used. */
export async function resolveSmartMatchExplanation(hospitalId: string, criteria: Criteria) {
  await expirePendingHolds();
  const hospitalsCollection = await getHospitalsCollection();
  const hospital = await hospitalsCollection.findOne({
    $or: [
      ...(ObjectId.isValid(hospitalId) ? [{ _id: new ObjectId(hospitalId) }] : []),
      { id: hospitalId },
      { code: hospitalId },
    ],
    status: { $in: ["active", "busy"] },
  });
  if (!hospital?.location?.coordinates || !hospital.name) return null;
  const id = hospital._id?.toString() ?? hospital.id ?? hospital.code;
  if (!id) return null;
  const [resourceDocuments, doctorDocuments] = await Promise.all([
    (await getResourcesCollection()).find({ hospitalId: { $in: [id, hospital.code] } }).toArray(),
    (await getDoctorsCollection()).find({ hospitalId: { $in: [id, hospital.code] }, availability: { $in: ["available", "on_call"] } }).toArray(),
  ]);
  const resources = resourceDocuments.map((resource) => ({
    id: resource._id?.toString() ?? resource.id ?? "", type: resource.type, category: resource.category,
    totalQuantity: resource.totalQuantity,
    availableQuantity: resource.status === "unavailable" ? 0 : Math.max(0, resource.type === "bed"
      ? Math.min(resource.availableQuantity ?? 0, (resource.totalQuantity ?? 0) - (resource.confirmedQuantity ?? 0) - (resource.heldQuantity ?? 0))
      : (resource.availableQuantity ?? 0) - (resource.heldQuantity ?? 0)),
    updatedAt: resource.updatedAt,
  }));
  resources.push(...doctorDocuments.map((doctor) => ({ id: "", type: "specialist" as const, category: doctor.specialization, totalQuantity: 1, availableQuantity: 1, updatedAt: doctor.updatedAt })));
  const candidate = {
    id, name: hospital.name, location: hospital.location, status: hospital.status, resources,
  };
  const [withTravel] = await addTravelTimes([candidate], criteria.ambulanceLocation, { allowEstimatedFallback: false });
  if (!withTravel) return null;
  const settings = await (await clientPromise).db().collection<{ weights?: { resource?: number; travel?: number; freshness?: number } }>("carelinkSettings").findOne({ _id: "carelink" } as never);
  const configured = settings?.weights;
  const valid = [configured?.resource, configured?.travel, configured?.freshness].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    && (configured!.resource! + configured!.travel! + configured!.freshness!) > 0;
  const weights = criteria.priority === "resources" ? { resourceMatch: 70, travelTime: 15, freshness: 15, availability: 0 }
    : criteria.priority === "travel" ? { resourceMatch: 20, travelTime: 65, freshness: 15, availability: 0 }
      : criteria.priority === "freshness" ? { resourceMatch: 25, travelTime: 20, freshness: 55, availability: 0 }
        : valid ? { resourceMatch: configured!.resource!, travelTime: configured!.travel!, freshness: configured!.freshness!, availability: 0 }
          : { resourceMatch: 50, travelTime: 30, freshness: 20, availability: 0 };
  const [match] = rankHospitals([withTravel], criteria, { limit: 1, weights });
  if (!match || match.travelTimeMinutes !== null && match.travelTimeMinutes > (criteria.maxTravelMinutes ?? 240)) return null;
  const coordinates = hospital.location.coordinates;
  const lat1 = criteria.ambulanceLocation.latitude * Math.PI / 180;
  const lat2 = coordinates[1] * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (coordinates[0] - criteria.ambulanceLocation.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const lastUpdated = resources.map((resource) => isoDate(resource.updatedAt)).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return {
    hospitalId: id, name: hospital.name, status: hospital.status,
    score: match.score, matchedResources: match.matchedResources, missingResources: match.missingResources,
    scoreBreakdown: match.scoreBreakdown, travelTimeMinutes: match.travelTimeMinutes,
    distanceKm: Math.round(6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10,
    address: typeof hospital.address === "string" ? hospital.address : [hospital.address?.street, hospital.address?.city, hospital.address?.state, hospital.address?.zipCode, hospital.address?.country].filter(Boolean).join(", "),
    lastUpdated, stale: !lastUpdated || Date.now() - Date.parse(lastUpdated) > 24 * 60 * 60 * 1000,
    confirmationStatus: hospital.isDemo ? "demo record" : "registered; availability reported, live confirmation unavailable",
  };
}
