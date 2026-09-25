import { requireRole } from "@/lib/auth-utils";
import { distanceKm, mapsUrl, sosCollections, validCoordinates } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests, drivers } = await sosCollections();
  const driver = await drivers.findOne({ userId: auth.user.id, available: true });
  if (!driver) return Response.json({ requests: [], message: "Set yourself as available with a current location to receive SOS requests" });
  const sosRequests = await requests.find({ status: "searching" }).sort({ createdAt: 1 }).toArray();
  return Response.json({ requests: sosRequests.map((sos) => ({ id: sos._id, incidentType: sos.incidentType, requiredEquipment: sos.requiredEquipment, createdAt: sos.createdAt, distanceKm: validCoordinates(driver.location) ? Number(distanceKm(driver.location, sos.location).toFixed(1)) : null })) });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  let body: { available?: unknown; location?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.available !== "boolean" || (body.location !== undefined && !validCoordinates(body.location))) return Response.json({ error: "available must be boolean and location must contain valid coordinates" }, { status: 400 });
  const { drivers } = await sosCollections();
  await drivers.updateOne({ userId: auth.user.id }, { $set: { userId: auth.user.id, available: body.available, ...(body.location ? { location: body.location, locationUpdatedAt: new Date() } : {}), updatedAt: new Date() } }, { upsert: true });
  return Response.json({ available: body.available, location: body.location ?? undefined });
}
