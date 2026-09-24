import { requireRole } from "@/lib/auth-utils";
import { mapsUrl, sosCollections, validCoordinates } from "@/lib/sos";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/sos/[id]/accept">) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  let body: { location?: unknown } = {};
  try { body = await request.json(); } catch { /* no body is allowed */ }
  const { id } = await context.params;
  const { requests, drivers } = await sosCollections();
  const driver = await drivers.findOne({ userId: auth.user.id, available: true });
  if (!driver) return Response.json({ error: "Driver is not marked available" }, { status: 409 });
  if (body.location !== undefined && !validCoordinates(body.location)) return Response.json({ error: "location must contain valid coordinates" }, { status: 400 });
  if (validCoordinates(body.location)) await drivers.updateOne({ userId: auth.user.id }, { $set: { location: body.location, locationUpdatedAt: new Date() } });
  const reserved = await drivers.updateOne({ userId: auth.user.id, available: true }, { $set: { available: false, activeRequestId: id, updatedAt: new Date() } });
  if (reserved.modifiedCount !== 1) return Response.json({ error: "Driver is already handling another request" }, { status: 409 });
  const result = await requests.updateOne({ _id: id, status: "searching", driverId: null }, { $set: { status: "accepted", driverId: auth.user.id, acceptedAt: new Date() } });
  if (result.modifiedCount !== 1) {
    await drivers.updateOne({ userId: auth.user.id, activeRequestId: id }, { $set: { available: true }, $unset: { activeRequestId: "" } });
    return Response.json({ error: "SOS request is no longer available" }, { status: 409 });
  }
  const sos = await requests.findOne({ _id: id });
  if (!sos) return Response.json({ error: "SOS request not found" }, { status: 404 });
  return Response.json({ request: { id: sos._id, status: sos.status }, patient: { name: sos.patientName, location: sos.location }, directionsUrl: mapsUrl(sos.location, validCoordinates(body.location) ? body.location : validCoordinates(driver.location) ? driver.location : undefined) });
}
