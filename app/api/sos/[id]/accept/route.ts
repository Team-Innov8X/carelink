import { requireRole } from "@/lib/auth-utils";
import { expireAndReofferDriverOffers, mapsUrl, sosCollections, validCoordinates } from "@/lib/sos";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/sos/[id]/accept">) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  let body: { location?: unknown } = {};
  try { body = await request.json(); } catch { /* no body is allowed */ }
  const { id } = await context.params;
  const { requests, drivers } = await sosCollections();
  await expireAndReofferDriverOffers();
  await drivers.updateMany({ userId: auth.user.id, pendingOfferExpiresAt: { $lte: new Date() } }, { $unset: { pendingOfferRequestId: '', pendingOfferExpiresAt: '' } });
  const driver = await drivers.findOne({ userId: auth.user.id, available: true, $or: [{ pendingOfferRequestId: id }, { pendingOfferRequestId: { $exists: false } }] });
  if (!driver) return Response.json({ error: "Driver is not marked available" }, { status: 409 });
  if (body.location !== undefined && !validCoordinates(body.location)) return Response.json({ error: "location must contain valid coordinates" }, { status: 400 });
  if (validCoordinates(body.location)) await drivers.updateOne({ userId: auth.user.id }, { $set: { location: body.location, locationUpdatedAt: new Date() } });
  const reserved = await drivers.updateOne({ userId: auth.user.id, available: true, $or: [{ pendingOfferRequestId: id }, { pendingOfferRequestId: { $exists: false } }] }, { $set: { available: false, activeRequestId: id, updatedAt: new Date() }, $unset: { pendingOfferRequestId: '', pendingOfferExpiresAt: '' } });
  if (reserved.modifiedCount !== 1) return Response.json({ error: "Driver is already handling another request" }, { status: 409 });
  const sos = await requests.findOne({ _id: id, status: "searching", driverId: null, rejectedDriverIds: { $ne: auth.user.id }, $or: [{ assignedDriverId: auth.user.id }, { assignedDriverId: { $exists: false } }] });
  if (!sos) {
    await drivers.updateOne({ userId: auth.user.id, activeRequestId: id }, { $set: { available: true }, $unset: { activeRequestId: "", pendingOfferRequestId: '', pendingOfferExpiresAt: '' } });
    return Response.json({ error: "SOS request is no longer available" }, { status: 409 });
  }
  const acceptedAt = new Date();
  if (Date.now() - new Date(sos.createdAt).getTime() > 60 * 1000) {
    await requests.updateOne({ _id: id, status: "searching" }, { $set: { status: "rejected", rejectionReason: "No driver accepted the request within 1 minute", updatedAt: new Date() } });
    await drivers.updateOne({ userId: auth.user.id, activeRequestId: id }, { $set: { available: true }, $unset: { activeRequestId: "" } });
    return Response.json({ error: "This request has expired and was rejected because no driver accepted within 1 minute" }, { status: 410 });
  }
  const result = await requests.updateOne({ _id: id, status: "searching", driverId: null, rejectedDriverIds: { $ne: auth.user.id }, $or: [{ assignedDriverId: auth.user.id }, { assignedDriverId: { $exists: false } }] }, { $set: { status: "accepted", driverId: auth.user.id, acceptedAt, tripStage: 'accepted', tripTimestamps: { accepted: acceptedAt } }, $unset: { assignedDriverId: '', assignmentExpiresAt: '' } });
  if (result.modifiedCount !== 1) {
    await drivers.updateOne({ userId: auth.user.id, activeRequestId: id }, { $set: { available: true }, $unset: { activeRequestId: "", pendingOfferRequestId: '', pendingOfferExpiresAt: '' } });
    return Response.json({ error: "SOS request is no longer available" }, { status: 409 });
  }
  await requests.updateMany(
    { patientId: sos.patientId, _id: { $ne: id }, status: "searching" },
    { $set: { status: "cancelled", cancelledAt: new Date(), cancellationReason: "Another active SOS for this patient was accepted" } },
  );
  const driverLocation = validCoordinates(body.location) ? body.location : validCoordinates(driver.location) ? driver.location : undefined;
  return Response.json({ request: { id: sos._id, status: "accepted" }, patient: { name: sos.patientName, phone: sos.patientPhone, location: sos.location }, driverLocation, directionsUrl: mapsUrl(sos.location, driverLocation) });
}
