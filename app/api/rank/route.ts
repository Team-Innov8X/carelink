import { NextResponse } from "next/server";
import { getDoctorsCollection, getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import { addTravelTimes, rankHospitals } from "@/lib/ranking";
import { rankRequestSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";
import { requireRole } from "@/lib/auth-utils";
import { expirePendingHolds } from "@/lib/services/hold-service";
import clientPromise from "@/lib/mongodb";

export async function POST(request: Request) {
  const auth = await requireRole(["ambulance_driver", "driver", "dispatcher", "patient"]);
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  let input;
  try { input = rankRequestSchema.safeParse(await request.json()); }
  catch { return errorResponse("Request body must be valid JSON.", 400); }
  if (!input.success) return validationError(input.error);
  try {
    await expirePendingHolds();
    const [hospitalDocuments, resourceDocuments, doctorDocuments, settingsDocument] = await Promise.all([
      (await getHospitalsCollection()).find({ status: { $in: ["active", "busy"] } }).toArray(),
      (await getResourcesCollection()).find({}).toArray(),
      (await getDoctorsCollection()).find({ availability: { $in: ["available", "on_call"] } }).toArray(),
      (await clientPromise).db().collection("carelinkSettings").findOne({ _id: "carelink" } as never),
    ]);
    const rankingSettings = settingsDocument as { weights?: { resource?: number; travel?: number; freshness?: number } } | null;
    const eligibleHospitals = [...new Map(hospitalDocuments.filter((hospital) => {
      const coordinates = hospital.location?.coordinates;
      const id = hospital._id?.toString() ?? hospital.id ?? hospital.code;
      return Boolean(id && hospital.name?.trim() && coordinates && coordinates.length === 2 && coordinates.every(Number.isFinite));
    }).map((hospital) => [hospital._id?.toString() ?? hospital.id ?? hospital.code, hospital])).values()];
    const hospitals = eligibleHospitals.map((hospital) => {
      const hid = hospital._id?.toString() ?? hospital.id ?? hospital.code;
      const matchedResources = resourceDocuments.filter((resource) => resource.hospitalId === hid || resource.hospitalId === hospital.code).map((resource) => ({
        id: resource._id?.toString() ?? resource.id ?? "", type: resource.type, category: resource.category,
        totalQuantity: resource.totalQuantity,
        availableQuantity: resource.status === "unavailable" ? 0 : Math.max(0, resource.type === "bed"
          ? Math.min(resource.availableQuantity ?? 0, (resource.totalQuantity ?? 0) - (resource.confirmedQuantity ?? 0) - (resource.heldQuantity ?? 0))
          : (resource.availableQuantity ?? 0) - (resource.heldQuantity ?? 0)), updatedAt: resource.updatedAt,
      }));
      const matchedDoctors = doctorDocuments.filter((d) => d.hospitalId === hid || d.hospitalId === hospital.code).map((d) => ({
        id: "", type: "specialist" as const, category: d.specialization, totalQuantity: 1, availableQuantity: 1, updatedAt: d.updatedAt,
      }));
      return {
        id: hid,
        name: hospital.name, location: hospital.location, status: hospital.status,
        resources: [...matchedResources, ...matchedDoctors],
        responseRate: hospital.responseRate,
      };
    });
    const withTravelTimes = await addTravelTimes(hospitals, input.data.ambulanceLocation);
    const weights = rankingSettings?.weights;
    const configuredValues = [weights?.resource, weights?.travel, weights?.freshness];
    const configuredTotal = configuredValues.reduce<number>((sum, value) => sum + (typeof value === "number" ? value : Number.NaN), 0);
    const hasValidWeights = configuredValues.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0) && Number.isFinite(configuredTotal) && configuredTotal > 0;
    const balancedWeights = hasValidWeights
      ? { resourceMatch: weights!.resource!, travelTime: weights!.travel!, freshness: weights!.freshness!, availability: 0 }
      : { resourceMatch: 50, travelTime: 30, freshness: 20, availability: 0 };
    const scoringWeights = input.data.priority === "resources"
      ? { resourceMatch: 70, travelTime: 15, freshness: 15, availability: 0 }
      : input.data.priority === "travel"
        ? { resourceMatch: 20, travelTime: 65, freshness: 15, availability: 0 }
        : input.data.priority === "freshness"
          ? { resourceMatch: 25, travelTime: 20, freshness: 55, availability: 0 }
          : balancedWeights;
    const weightTotal = Object.values(scoringWeights).reduce((sum, weight) => sum + weight, 0);
    const displayedWeights = Object.fromEntries(Object.entries(scoringWeights).map(([key, weight]) => [key, Math.round(weight / weightTotal * 10000) / 100])) as typeof scoringWeights;
    const ranked = rankHospitals(withTravelTimes, input.data, {
      limit: input.data.limit ?? 100,
      weights: scoringWeights,
    });
    const resourceMap = new Map(hospitals.map((hospital) => [hospital.id, hospital.resources]));
    const filtered = ranked.filter((item) => item.travelTimeMinutes === null || item.travelTimeMinutes <= (input.data.maxTravelMinutes ?? 240));
    const withDetails = filtered.map((item) => {
      const hospital = eligibleHospitals.find((doc) => (doc._id?.toString() ?? doc.id ?? doc.code) === item.hospitalId);
      const raw = resourceMap.get(item.hospitalId) ?? [];
      const [longitude, latitude] = hospital?.location.coordinates ?? [0, 0];
      const lat1 = input.data.ambulanceLocation.latitude * Math.PI / 180;
      const lat2 = latitude * Math.PI / 180;
      const dLat = lat2 - lat1;
      const dLon = (longitude - input.data.ambulanceLocation.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      return { ...item, distanceKm: Math.round(6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10,
        resources: raw.map((resource) => ({ id: resource.id, type: resource.type, category: resource.category, totalQuantity: resource.totalQuantity, availableQuantity: resource.availableQuantity })),
      };
    });
    return NextResponse.json({ emergencyType: input.data.emergencyType, rankingWeights: displayedWeights, ranked: withDetails });
  } catch {
    return errorResponse("Failed to rank hospitals.", 500);
  }
}
