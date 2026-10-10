import { NextResponse } from "next/server";
import { getDoctorsCollection, getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import { addTravelTimes, rankHospitals } from "@/lib/ranking";
import { rankRequestSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";
import { requireRole } from "@/lib/auth-utils";
import { expirePendingHolds } from "@/lib/services/hold-service";
import clientPromise from "@/lib/mongodb";
import { INITIAL_PHARMACIES } from "@/data/mockPharmacies";
import { INITIAL_MEDICINES } from "@/data/mockMedicines";
import { SMART_MATCH_DEMO_HOSPITALS, SMART_MATCH_DEMO_MEDICINES, SMART_MATCH_DEMO_PHARMACIES, SMART_MATCH_DEMO_RESOURCES } from "@/data/smartMatchDemo";

const normalizeText = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
const freshnessAt = (value: unknown) => {
  const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

export async function POST(request: Request) {
  const auth = await requireRole(["ambulance_driver", "driver", "dispatcher", "patient"]);
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  let input;
  try { input = rankRequestSchema.safeParse(await request.json()); }
  catch { return errorResponse("Request body must be valid JSON.", 400); }
  if (!input.success) return validationError(input.error);
  try {
    await expirePendingHolds();
    const [hospitalDocuments, resourceDocuments, doctorDocuments, settingsDocument, appStateDocument] = await Promise.all([
      (await getHospitalsCollection()).find({ status: { $in: ["active", "busy"] } }).toArray(),
      (await getResourcesCollection()).find({}).toArray(),
      (await getDoctorsCollection()).find({ availability: { $in: ["available", "on_call"] } }).toArray(),
      (await clientPromise).db().collection("carelinkSettings").findOne({ _id: "carelink" } as never),
      input.data.medicine ? (await clientPromise).db().collection<{ state?: { pharmacies?: Array<Record<string, unknown>>; medicines?: Array<Record<string, unknown>> } }>("appState").findOne({ _id: "carelink" } as never) : Promise.resolve(null),
    ]);
    const rankingSettings = settingsDocument as { weights?: { resource?: number; travel?: number; freshness?: number } } | null;
    const eligibleHospitals = [...new Map(hospitalDocuments.filter((hospital) => {
      const coordinates = hospital.location?.coordinates;
      const id = hospital._id?.toString() ?? hospital.id ?? hospital.code;
      return Boolean(id && hospital.name?.trim() && coordinates && coordinates.length === 2 && coordinates.every(Number.isFinite));
    }).map((hospital) => [hospital._id?.toString() ?? hospital.id ?? hospital.code, hospital])).values()];
    // Demo inventory is opt-in and isolated from registered records. It is used
    // only when there are no live hospital records at all.
    const usingHospitalDemo = input.data.demoFallback && eligibleHospitals.length === 0;
    const matchHospitals = usingHospitalDemo ? SMART_MATCH_DEMO_HOSPITALS as unknown as typeof eligibleHospitals : eligibleHospitals;
    const matchResources = usingHospitalDemo ? SMART_MATCH_DEMO_RESOURCES as unknown as typeof resourceDocuments : resourceDocuments;
    const hospitals = matchHospitals.map((hospital) => {
      const hid = hospital._id?.toString() ?? hospital.id ?? hospital.code;
      const matchedResources = matchResources.filter((resource) => resource.hospitalId === hid || resource.hospitalId === hospital.code).map((resource) => ({
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
        demoTravelTimeMinutes: "demoTravelTimeMinutes" in hospital ? hospital.demoTravelTimeMinutes : undefined,
      };
    });
    // Smart Match exposes route travel only when Google Routes returns it. The
    // ranking engine gives missing route data zero travel credit.
    const withTravelTimes = usingHospitalDemo
      ? hospitals.map((hospital) => {
        const [longitude, latitude] = hospital.location.coordinates;
        const lat1 = input.data.ambulanceLocation.latitude * Math.PI / 180;
        const lat2 = latitude * Math.PI / 180;
        const dLat = lat2 - lat1;
        const dLon = (longitude - input.data.ambulanceLocation.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        const km = 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const sampleBaseline = typeof hospital.demoTravelTimeMinutes === "number" ? hospital.demoTravelTimeMinutes : 15;
        return { ...hospital, travelTimeMinutes: Math.round((sampleBaseline + km / 0.5) * 10) / 10 };
      })
      : await addTravelTimes(hospitals, input.data.ambulanceLocation, { allowEstimatedFallback: false });
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
    // Apply hard travel eligibility before the result limit so a nearby candidate
    // is not lost behind candidates that are later excluded.
    const ranked = rankHospitals(withTravelTimes, input.data, {
      limit: 100,
      weights: scoringWeights,
    });
    const resourceMap = new Map(hospitals.map((hospital) => [hospital.id, hospital.resources]));
    const filtered = ranked.filter((item) => item.travelTimeMinutes === null || item.travelTimeMinutes <= (input.data.maxTravelMinutes ?? 240));
    const withDetails = filtered.slice(0, input.data.limit ?? 100).map((item) => {
      const hospital = matchHospitals.find((doc) => (doc._id?.toString() ?? doc.id ?? doc.code) === item.hospitalId);
      const raw = resourceMap.get(item.hospitalId) ?? [];
      const [longitude, latitude] = hospital?.location.coordinates ?? [0, 0];
      const latestResourceUpdate = raw.map((resource) => freshnessAt(resource.updatedAt)).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
      const hospitalAddress = hospital?.address;
      const address = typeof hospitalAddress === "string" ? hospitalAddress : hospitalAddress ? [hospitalAddress.street, hospitalAddress.city, hospitalAddress.state, hospitalAddress.zipCode, hospitalAddress.country].filter(Boolean).join(", ") : null;
      const lat1 = input.data.ambulanceLocation.latitude * Math.PI / 180;
      const lat2 = latitude * Math.PI / 180;
      const dLat = lat2 - lat1;
      const dLon = (longitude - input.data.ambulanceLocation.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      return { ...item, distanceKm: Math.round(6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10,
        address,
        lastUpdated: latestResourceUpdate,
        stale: !latestResourceUpdate || Date.now() - Date.parse(latestResourceUpdate) > 24 * 60 * 60 * 1000,
        confirmationStatus: hospital?.isDemo ? "fictional demo inventory; not confirmed" : hospital?.status === "active" || hospital?.status === "busy" ? "registered; availability reported, live confirmation unavailable" : "unconfirmed",
        isDemo: Boolean(hospital?.isDemo),
        resources: raw.map((resource) => ({ id: resource.id, type: resource.type, category: resource.category, totalQuantity: resource.totalQuantity, availableQuantity: resource.availableQuantity })),
      };
    });
    const pharmacyRecords = [
      ...(appStateDocument?.state?.pharmacies ?? INITIAL_PHARMACIES as unknown as Array<Record<string, unknown>>),
      ...(input.data.demoFallback ? SMART_MATCH_DEMO_PHARMACIES as unknown as Array<Record<string, unknown>> : []),
    ];
    const medicineRecords = [
      ...(appStateDocument?.state?.medicines ?? INITIAL_MEDICINES as unknown as Array<Record<string, unknown>>),
      ...(input.data.demoFallback ? SMART_MATCH_DEMO_MEDICINES as unknown as Array<Record<string, unknown>> : []),
    ];
    const matchedMedicine = input.data.medicine ? medicineRecords.slice().sort((a, b) => Number(Boolean(b.isDemo)) - Number(Boolean(a.isDemo))).find((item) => normalizeText(item.name) === normalizeText(input.data.medicine!.name)
      && (!input.data.medicine!.formulation || normalizeText(item.form) === normalizeText(input.data.medicine!.formulation))) : undefined;
    const inventoryLogs = matchedMedicine ? await (await clientPromise).db().collection<{ pharmacyId?: string; medicineId?: string; createdAt?: Date | string }>("pharmacyInventoryLog").find({ medicineId: String(matchedMedicine.id) }).sort({ createdAt: -1 }).toArray() : [];
    const pharmacies = input.data.medicine && matchedMedicine ? pharmacyRecords.flatMap((pharmacy) => {
      const medicine = matchedMedicine;
      const stock = Number((medicine.stock as Record<string, unknown> | undefined)?.[String(pharmacy.id)] ?? 0);
      if (!Number.isFinite(stock) || stock < input.data.medicine!.quantity) return [];
      const location = pharmacy.location as { lat?: number; lng?: number } | undefined;
      if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) return [];
      const lat1 = input.data.ambulanceLocation.latitude * Math.PI / 180;
      const lat2 = location!.lat! * Math.PI / 180;
      const dLat = lat2 - lat1;
      const dLon = (location!.lng! - input.data.ambulanceLocation.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const distanceKm = Math.round(6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
      // Keep sample pharmacy inventory local to the requested travel radius.
      if (pharmacy.isDemo && distanceKm > (input.data.maxTravelMinutes ?? 240) * 0.5) return [];
      const latestInventoryLog = inventoryLogs.find((log) => log.pharmacyId === String(pharmacy.id));
      const updatedAt = freshnessAt(latestInventoryLog?.createdAt);
      const ageHours = updatedAt ? Math.max(0, (Date.now() - Date.parse(updatedAt)) / 3_600_000) : Number.POSITIVE_INFINITY;
      const freshness = Number.isFinite(ageHours) ? 2 ** (-ageHours / 6) : 0;
      const travelFit = Math.max(0, 1 - distanceKm / 100);
      return [{
        id: String(pharmacy.id), name: String(pharmacy.name ?? "Pharmacy"), address: String(pharmacy.address ?? ""),
        medicineName: String(medicine.name), formulation: String(medicine.form ?? "Not specified"), stock,
        distanceKm, score: Math.round((travelFit * 60 + freshness * 40) * 100) / 100,
        lastUpdated: updatedAt, stale: ageHours > 24, confirmationStatus: "reported stock; pharmacy confirmation required",
        dataStatus: "demo inventory", isDemo: true,
      }];
    }).sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm).slice(0, input.data.limit ?? 100) : [];
    return NextResponse.json({ emergencyType: input.data.emergencyType, urgency: input.data.urgency ?? "routine", demoMode: usingHospitalDemo || pharmacies.some((item) => item.isDemo), rankingWeights: displayedWeights, ranked: withDetails, pharmacies, pharmacyWeights: { travel: 60, freshness: 40 } });
  } catch {
    return errorResponse("Failed to rank hospitals.", 500);
  }
}
