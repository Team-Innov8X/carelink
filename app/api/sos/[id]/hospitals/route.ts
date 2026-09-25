import { requireRole } from "@/lib/auth-utils";
import { distanceKm, mapsUrl, sosCollections, type Coordinates } from "@/lib/sos";

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
  const allHospitals = await hospitals.find({}).toArray();
  const suitable = allHospitals.filter((hospital) => Array.isArray(hospital.equipment) && hospital.equipment.length > 0 && sos.requiredEquipment.every((needed) => hospital.equipment.some((item) => item.toLowerCase() === needed.toLowerCase())) && typeof hospital.location?.latitude === "number" && typeof hospital.location?.longitude === "number");
  const nearby = suitable.map((hospital) => ({ id: String(hospital._id), name: hospital.name, address: hospital.address ?? null, location: hospital.location, equipment: hospital.equipment, distanceKm: Number(distanceKm(origin, hospital.location).toFixed(1)), directionsUrl: mapsUrl(hospital.location, origin) })).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
  return Response.json({ hospitals: nearby, message: nearby.length ? undefined : "No hospital with all required equipment is registered" });
}
