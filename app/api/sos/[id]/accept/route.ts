import { requireRole } from "@/lib/auth-utils";
import { mapsUrl, sosCollections, validCoordinates } from "@/lib/sos";
import { STALE_LOCATION_SECONDS } from "@/lib/dispatch/constants";

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
  if (!offer || !["offered", "pending"].includes(offer.status) || offer.expiresAt <= now) {
    if (["taken", "superseded"].includes(offer?.status ?? "")) return Response.json({ error: "This request has already been taken." }, { status: 409 });
    if (["offered", "pending"].includes(offer?.status ?? "")) await offers.updateOne({ _id: offer!._id, status: offer!.status }, {
      $set: { status: "expired", respondedAt: now },
      $push: { transitionLog: { from: offer!.status, to: "expired", at: now, actor: { type: "system", id: "dispatch" }, reason: "Offer expired before acceptance" } },
    });
    return Response.json({ error: "This offer has expired." }, { status: 410 });
  }
  const driver = await drivers.findOne({ userId: auth.user.id, available: true, activeRequestId: { $exists: false } });
  if (!driver) return Response.json({ error: "Driver is not available" }, { status: 409 });
  if (body.location !== undefined && !validCoordinates(body.location)) return Response.json({ error: "location must contain valid coordinates" }, { status: 400 });
  if (!validCoordinates(body.location) && (!driver.locationUpdatedAt || driver.locationUpdatedAt.getTime() < Date.now() - STALE_LOCATION_SECONDS * 1000)) {
    return Response.json({ error: "Update your location before accepting this offer." }, { status: 409 });
  }
  const sos = await requests.findOne({ _id: id, status: "searching" });
  if (!sos) return Response.json({ error: "This request has already been taken." }, { status: 409 });
  const acceptedAt = new Date();
  const reserved = await drivers.updateOne({ userId: auth.user.id, available: true, activeRequestId: { $exists: false } }, { $set: { available: false, activeRequestId: id, updatedAt: acceptedAt, ...(validCoordinates(body.location) ? { location: body.location, locationUpdatedAt: acceptedAt } : {}) } });
  if (!reserved.modifiedCount) return Response.json({ error: "Driver is already handling another request" }, { status: 409 });
  const result = await requests.findOneAndUpdate(
    { _id: id, status: "searching" },
    { $set: { status: "accepted", dispatchStatus: "accepted", driverId: auth.user.id, assignedDriverId: auth.user.id, acceptedAt, tripStage: "accepted", tripTimestamps: { accepted: acceptedAt } }, $push: { transitionLog: { from: "offered", to: "accepted", at: acceptedAt, actor: { type: "driver", id: auth.user.id }, reason: "Offer accepted" } } },
    { returnDocument: "after" },
  );
  if (!result) {
    await drivers.updateOne({ userId: auth.user.id, activeRequestId: id }, { $set: { available: true, updatedAt: new Date() }, $unset: { activeRequestId: "" } });
    return Response.json({ error: "This request has already been taken." }, { status: 409 });
  }
  const offerAccepted = await offers.updateOne({ _id: offer._id, status: offer.status, expiresAt: { $gt: now } }, {
    $set: { status: "accepted", respondedAt: acceptedAt },
    $push: { transitionLog: { from: offer.status, to: "accepted", at: acceptedAt, actor: { type: "driver", id: auth.user.id }, reason: "Driver accepted offer" } },
  });
  if (!offerAccepted.modifiedCount) {
    await requests.updateOne({ _id: id, driverId: auth.user.id, status: "accepted" }, { $set: { status: "searching", dispatchStatus: "offered" }, $unset: { driverId: "", assignedDriverId: "", acceptedAt: "", tripStage: "", tripTimestamps: "" }, $pop: { transitionLog: 1 } });
    await drivers.updateOne({ userId: auth.user.id, activeRequestId: id }, { $set: { available: true, updatedAt: new Date() }, $unset: { activeRequestId: "" } });
    return Response.json({ error: "This offer has expired or was already taken." }, { status: 409 });
  }
  await Promise.all((["offered", "pending"] as const).map((from) => offers.updateMany(
    { requestId: id, driverId: { $ne: auth.user.id }, status: from },
    { $set: { status: "superseded", respondedAt: acceptedAt }, $push: { transitionLog: { from, to: "superseded", at: acceptedAt, actor: { type: "system", id: "dispatch" }, reason: "Another driver accepted this request" } } },
  )));
  await Promise.all((["offered", "pending"] as const).map((from) => offers.updateMany(
    { driverId: auth.user!.id, requestId: { $ne: id }, status: from },
    { $set: { status: "superseded", respondedAt: acceptedAt }, $push: { transitionLog: { from, to: "superseded", at: acceptedAt, actor: { type: "system", id: "dispatch" }, reason: "Driver accepted another trip" } } },
  )));
  const driverLocation = validCoordinates(body.location) ? body.location : validCoordinates(driver.location) ? driver.location : undefined;
  return Response.json({ request: { id, status: "accepted" }, patient: { name: sos.patientName, phone: sos.patientPhone, location: sos.location }, driverLocation, directionsUrl: mapsUrl(sos.location, driverLocation) });
}
