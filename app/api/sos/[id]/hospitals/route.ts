import { requireRole } from "@/lib/auth-utils";
import { distanceKm, mapsUrl, sosCollections, type Coordinates } from "@/lib/sos";
import { getResourcesCollection } from "@/lib/models";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/sos/[id]/hospitals">) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await context.params;
  const { requests, drivers, hospitals } = await sosCollections();
  const sos = await requests.findOne({ _id: id, driverId: auth.user.id, status: "accepted" });
  if (!sos) return Response.json({ error: "Accepted SOS request not found for this driver" }, { status: 404 });
  const driver = await drivers.findOne({ userId: auth.user.id });
  const origin = (driver?.location as Coordinates | undefined) ?? sos.location;
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 5);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(20, Math.floor(limitParam))) : 5;
  const [allHospitals, resources] = await Promise.all([
    hospitals.find({ status: { $ne: "inactive" } }).toArray(),
    (await getResourcesCollection()).find({ type: "equipment", status: { $ne: "unavailable" } }).toArray(),
  ]);
  const equipmentByHospital = new Map<string, Set<string>>();
  for (const resource of resources) {
    if (resource.availableQuantity - resource.heldQuantity <= 0) continue;
    const equipment = equipmentByHospital.get(resource.hospitalId) ?? new Set<string>();
    equipment.add(resource.category.toLowerCase());
    equipmentByHospital.set(resource.hospitalId, equipment);
  }
  const candidates = allHospitals.flatMap((hospital) => {
    const rawLocation = hospital.location as unknown as { latitude?: unknown; longitude?: unknown; coordinates?: unknown };
    const location: Coordinates | null = typeof rawLocation?.latitude === "number" && typeof rawLocation.longitude === "number"
      ? { latitude: rawLocation.latitude, longitude: rawLocation.longitude }
      : Array.isArray(rawLocation?.coordinates) && typeof rawLocation.coordinates[0] === "number" && typeof rawLocation.coordinates[1] === "number"
        ? { latitude: rawLocation.coordinates[1], longitude: rawLocation.coordinates[0] }
        : null;
    if (!location) return [];
    const equipment = new Set([...(hospital.equipment ?? []).map((item) => item.toLowerCase()), ...(equipmentByHospital.get(String(hospital._id)) ?? [])]);
    if (!sos.requiredEquipment.every((needed) => equipment.has(needed.toLowerCase()))) return [];
    return [{ hospital, location, equipment: [...equipment] }];
  });
  const nearby = candidates.map(({ hospital, location, equipment }) => ({ id: String(hospital._id), name: hospital.name, address: hospital.address ?? null, location, equipment, distanceKm: Number(distanceKm(origin, location).toFixed(1)), directionsUrl: mapsUrl(location, origin) })).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
  return Response.json({ hospitals: nearby, message: nearby.length ? undefined : "No hospital with all required equipment is registered" });
}
