import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { errorResponse, validationError } from "@/lib/api-response";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import { hospitalCreateSchema } from "@/lib/validation";
import { expirePendingHolds } from "@/lib/services/hold-service";
import { getServerSession, resolveHospitalId } from "@/lib/auth-utils";

export async function GET(request: Request) {
  try {
    await expirePendingHolds();
    const query = new URL(request.url).searchParams;
    const queryLat = query.get("lat") === null ? null : Number(query.get("lat"));
    const queryLng = query.get("lng") === null ? null : Number(query.get("lng"));
    if ((queryLat === null) !== (queryLng === null) || queryLat !== null && (!Number.isFinite(queryLat) || queryLat < -90 || queryLat > 90) || queryLng !== null && (!Number.isFinite(queryLng) || queryLng < -180 || queryLng > 180)) {
      return errorResponse("Provide valid latitude and longitude together.", 400);
    }
    const radiusKm = Number(query.get("radiusKm") ?? 25);
    if (queryLat !== null && (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100)) return errorResponse("radiusKm must be between 1 and 100.", 400);
    const registeredOnly = query.get("registeredOnly") === "true";
    const category = query.get("emergencyType")?.trim() || query.get("specialty")?.trim();
    let hospitalIds: ObjectId[] | undefined;
    if (category) {
      const matches = await (await getResourcesCollection()).find({ category: { $regex: `^${escapeRegex(category)}$`, $options: "i" }, status: { $ne: "unavailable" }, $expr: { $gt: [{ $subtract: [{ $ifNull: ["$availableQuantity", 0] }, { $ifNull: ["$heldQuantity", 0] }] }, 0] } }).project({ hospitalId: 1 }).toArray();
      const ids = [...new Set(matches.map((item) => item.hospitalId))].filter(ObjectId.isValid).map((id) => new ObjectId(id));
      hospitalIds = ids;
    }
    const geoFilter = queryLat === null ? {} : { location: { $near: { $geometry: { type: "Point" as const, coordinates: [queryLng!, queryLat] }, $maxDistance: radiusKm * 1000 } } };
    const hospitals = await (await getHospitalsCollection()).find({ ...(hospitalIds ? { _id: { $in: hospitalIds } } : {}), ...(registeredOnly ? { isDemo: { $ne: true } } : {}), status: { $ne: "inactive" }, ...geoFilter }).toArray();
    const ids = hospitals.map((hospital) => String(hospital._id));
    const resourcesCollection = await getResourcesCollection();
    const now = new Date();
    for (const hospital of hospitals) {
      const hospitalId = String(hospital._id);
      const hasBeds = await resourcesCollection.findOne({ hospitalId, type: "bed" }, { projection: { _id: 1 } });
      const capacity = hospital.capacitySummary;
      if (!hasBeds && typeof capacity?.totalBeds === "number" && capacity.totalBeds > 0) {
        const total = Math.max(0, Math.floor(capacity.totalBeds));
        const available = Math.max(0, Math.min(total, Math.floor(capacity.availableBeds ?? 0)));
        await resourcesCollection.updateOne({ _id: `${hospitalId}-capacity-general` as never }, { $setOnInsert: {
          hospitalId, type: "bed", category: "general", name: "General beds", totalQuantity: total,
          availableQuantity: available, heldQuantity: 0, status: available ? "available" : "unavailable", createdAt: now, updatedAt: now,
        } }, { upsert: true });
      }
    }
    const resources = await resourcesCollection.find({ hospitalId: { $in: ids } }).toArray();
    const resourcesByHospital = new Map<string, typeof resources>();
    for (const resource of resources) {
      const group = resourcesByHospital.get(resource.hospitalId) ?? [];
      group.push(resource);
      resourcesByHospital.set(resource.hospitalId, group);
    }

    const toUiHospital = (hospital: (typeof hospitals)[number]) => {
      const raw = hospital as typeof hospital & Record<string, unknown>;
      const location = hospital.location as unknown as { coordinates?: unknown; latitude?: unknown; longitude?: unknown };
      const coordinates = Array.isArray(location?.coordinates) ? location.coordinates : [];
      const lat = typeof location?.latitude === "number" ? location.latitude : typeof coordinates[1] === "number" ? coordinates[1] : 0;
      const lng = typeof location?.longitude === "number" ? location.longitude : typeof coordinates[0] === "number" ? coordinates[0] : 0;
      const address = hospital.address;
      const addressText = typeof address === "string"
        ? address
        : [address?.street, address?.city, address?.state, address?.zipCode, address?.country].filter(Boolean).join(", ");
      const inventory = resourcesByHospital.get(String(hospital._id)) ?? [];
      const forBed = (categories: string[]) => {
        const matching = inventory.filter((item) => item.type === "bed" && categories.includes(String(item.category).toLowerCase()));
        const total = matching.reduce((sum, item) => sum + item.totalQuantity, 0);
        const available = matching.reduce((sum, item) => sum + Math.max(0, item.availableQuantity - item.heldQuantity), 0);
        return { total, available };
      };
      const general = forBed(["general", "emergency"]);
      const icu = forBed(["icu"]);
      const trauma = forBed(["trauma", "pediatric"]);
      const ventilatorEquipment = inventory.filter((item) => item.type === "equipment" && item.category === "ventilator");
      const ventilators = {
        total: ventilatorEquipment.reduce((sum, item) => sum + item.totalQuantity, 0),
        available: ventilatorEquipment.reduce((sum, item) => sum + Math.max(0, item.availableQuantity - item.heldQuantity), 0),
      };
      const capacity = hospital.capacitySummary;
      if (!general.total && capacity?.totalBeds) {
        general.total = capacity.totalBeds;
        general.available = capacity.availableBeds ?? 0;
      }
      if (!ventilators.total && capacity?.totalVentilators) {
        ventilators.total = capacity.totalVentilators;
        ventilators.available = capacity.availableVentilators ?? 0;
      }
      const specialties = Array.isArray(raw.specialties)
        ? raw.specialties.filter((value): value is string => typeof value === "string")
        : [...new Set(inventory.filter((item) => item.type === "specialist").map((item) => String(item.name || item.category)))];
      const hasAvailability = general.available + icu.available + trauma.available > 0;
      const hasCapacity = general.total + icu.total + trauma.total > 0;
      const status = hospital.status === "full" || (hasCapacity && !hasAvailability)
        ? "Full"
        : hospital.status === "busy" || hasAvailability || !hasCapacity
          ? (hospital.status === "busy" || !hasAvailability ? "Limited" : "Available")
          : "Limited";
      const distanceKm = queryLat === null ? 0 : calculateDistanceKm(queryLat, queryLng!, lat, lng);
      const contact = hospital.contact;
      const updatedAt = hospital.updatedAt ? new Date(hospital.updatedAt).getTime() : Date.now();
      return {
        id: String(hospital._id),
        code: hospital.code,
        name: hospital.name,
        distanceKm: Number(distanceKm.toFixed(1)),
        etaMin: Math.max(1, Math.round(distanceKm * 2.5)),
        beds: { general, icu, trauma, ventilators },
        specialties,
        specialtyDoctors: raw.specialtyDoctors && typeof raw.specialtyDoctors === "object" ? raw.specialtyDoctors : {},
        status,
        lastUpdatedMinutesAgo: Number.isFinite(updatedAt) ? Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000)) : 0,
        location: { lat, lng, address: addressText },
        phone: typeof contact === "object" && contact ? contact.phone : "",
        rating: typeof raw.rating === "number" ? raw.rating : 0,
      };
    };
    const results = hospitals.map(toUiHospital);
    const session = await getServerSession();
    const user = session?.user as (NonNullable<typeof session>["user"] & { role?: string; hospitalId?: string; hospitalName?: string }) | undefined;
    if (user?.role === "hospital" || user?.role === "hospital_staff") {
      const linkedHospitalId = await resolveHospitalId(user);
      if (linkedHospitalId) results.sort((left, right) => Number(right.id === linkedHospitalId) - Number(left.id === linkedHospitalId));
    }
    return NextResponse.json(results);
  } catch { return errorResponse("Failed to list hospitals", 500); }
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  let parsed;
  try { parsed = hospitalCreateSchema.safeParse(await request.json()); }
  catch { return errorResponse("Request body must be valid JSON", 400); }
  if (!parsed.success) return validationError(parsed.error);
  try {
    const now = new Date();
    const hospital = { ...parsed.data, code: `HOSP-${new ObjectId().toHexString().slice(-8).toUpperCase()}`, status: "active" as const, createdAt: now, updatedAt: now };
    const result = await (await getHospitalsCollection()).insertOne(hospital);
    return NextResponse.json({ ...hospital, _id: result.insertedId }, { status: 201 });
  } catch { return errorResponse("Failed to create hospital", 500); }
}

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function calculateDistanceKm(latitude: number, longitude: number, targetLatitude: number, targetLongitude: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(targetLatitude - latitude);
  const dLng = radians(targetLongitude - longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(targetLatitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
