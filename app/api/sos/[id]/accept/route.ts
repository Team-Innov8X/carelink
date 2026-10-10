import { requireRole } from "@/lib/auth-utils";
import { mapsUrl, sosCollections, validCoordinates } from "@/lib/sos";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/sos/[id]/accept">) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  let body: { location?: unknown } = {};
  try { body = await request.json(); } catch { /* location is optional */ }
  const { id } = await context.params;
  const { requests, drivers, offers } = await sosCollections();
  const now = new Date();
  const offer = await offers.findOne({ requestId: id, driverId: auth.user.id });
  if (!offer || offer.status !== "offered" || offer.expiresAt <= now) {
    if (offer?.status === "taken") return Response.json({ error: "This request has already been taken." }, { status: 409 });
    if (offer?.status === "offered") await offers.updateOne({ _id: offer._id, status: "offered" }, { $set: { status: "expired" } });
    return Response.json({ error: "This offer has expired." }, { status: 410 });
  }
  const driver = await drivers.findOne({ userId: auth.user.id, available: true, activeRequestId: { $exists: false } });
  if (!driver) return Response.json({ error: "Driver is not available" }, { status: 409 });
  if (body.location !== undefined && !validCoordinates(body.location)) return Response.json({ error: "location must contain valid coordinates" }, { status: 400 });
  const sos = await requests.findOne({ _id: id, status: "searching" });
  if (!sos) return Response.json({ error: "This request has already been taken." }, { status: 409 });
  const acceptedAt = new Date();
  const reserved = await drivers.updateOne(
    { userId: auth.user.id, available: true, activeRequestId: { $exists: false } },
    { $set: { available: false, activeRequestId: id, updatedAt: acceptedAt, ...(validCoordinates(body.location) ? { location: body.location, locationUpdatedAt: acceptedAt } : {}) } },
  );
  if (!reserved.modifiedCount) return Response.json({ error: "Driver is already handling another request" }, { status: 409 });
  const result = await requests.updateOne({ _id: id, status: "searching", driverId: null, rejectedDriverIds: { $ne: auth.user.id }, $or: [{ assignedDriverId: auth.user.id }, { assignedDriverId: { $exists: false } }] }, { $set: { status: "accepted", driverId: auth.user.id, acceptedAt, tripStage: 'accepted', tripTimestamps: { accepted: acceptedAt } }, $unset: { assignedDriverId: '', assignmentExpiresAt: '' } });
  if (result.modifiedCount !== 1) {
    await drivers.updateOne({ userId: auth.user.id, activeRequestId: id }, { $set: { available: true }, $unset: { activeRequestId: "", pendingOfferRequestId: '', pendingOfferExpiresAt: '' } });
    return Response.json({ error: "SOS request is no longer available" }, { status: 409 });
  }
  if (sos.requestType !== 'routine') {
    await requests.updateMany(
      { patientId: sos.patientId, _id: { $ne: id }, status: "searching", requestType: { $ne: 'routine' } },
      { $set: { status: "cancelled", cancelledAt: new Date(), cancellationReason: "Another active SOS for this patient was accepted" } },
    );
  }
  await offers.updateOne({ _id: offer._id, status: "offered", expiresAt: { $gt: now } }, { $set: { status: "accepted" } });
  await offers.updateMany({ requestId: id, driverId: { $ne: auth.user.id }, status: "offered" }, { $set: { status: "taken" } });
  const driverLocation = validCoordinates(body.location) ? body.location : validCoordinates(driver.location) ? driver.location : undefined;
  return Response.json({ request: { id, status: "accepted" }, patient: { name: sos.patientName, phone: sos.patientPhone, location: sos.location }, driverLocation, directionsUrl: mapsUrl(sos.location, driverLocation) });
}
