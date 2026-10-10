import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { errorResponse, validationError } from "@/lib/api-response";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import { hospitalCreateSchema } from "@/lib/validation";
import { distanceKm } from '@/lib/sos';

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const latValue = query.get('lat'); const lngValue = query.get('lng');
    if (latValue === null || lngValue === null) return errorResponse('Provide latitude and longitude to find nearby hospitals.', 400);
    const lat = Number(latValue); const lng = Number(lngValue);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return errorResponse('Provide valid latitude and longitude.', 400);
    const radiusKm = Math.max(1, Math.min(100, Number(query.get('radiusKm') || 25)));
    const category = query.get("emergencyType")?.trim() || query.get("specialty")?.trim();
    let hospitalIds: ObjectId[] | undefined;
    if (category) {
      const matches = await (await getResourcesCollection()).find({ category: { $regex: `^${escapeRegex(category)}$`, $options: "i" }, availableQuantity: { $gt: 0 } }).project({ hospitalId: 1 }).toArray();
      const ids = [...new Set(matches.map((item) => item.hospitalId))].filter(ObjectId.isValid).map((id) => new ObjectId(id));
      hospitalIds = ids;
    }
    const filter = { status: { $ne: 'inactive' as const }, location: { $near: { $geometry: { type: 'Point' as const, coordinates: [lng, lat] }, $maxDistance: radiusKm * 1000 } }, ...(hospitalIds ? { _id: { $in: hospitalIds } } : {}) };
    const hospitals = await (await getHospitalsCollection()).find(filter).limit(100).project({ name: 1, location: 1, address: 1, status: 1, isDemo: 1, capacitySummary: 1 }).toArray();
    return NextResponse.json(hospitals.map(hospital => {
      const [hLng, hLat] = hospital.location.coordinates;
      return { ...hospital, distanceKm: Number(distanceKm({ latitude: lat, longitude: lng }, { latitude: hLat, longitude: hLng }).toFixed(1)), isDemo: Boolean((hospital as typeof hospital & { isDemo?: boolean }).isDemo) };
    }));
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
