import { requireRole } from "@/lib/auth-utils";
import { distanceKm, mapsUrl, sosCollections, validCoordinates } from "@/lib/sos";

export const runtime = "nodejs";

async function getOpenRequests(requests: Awaited<ReturnType<typeof sosCollections>>["requests"]) {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  await requests.updateMany(
    { status: "searching", driverId: null, createdAt: { $lt: oneMinuteAgo } },
    { $set: { status: "rejected", rejectionReason: "No driver accepted the request within 1 minute", updatedAt: new Date() } },
  );
  const all = await requests.find({ status: "searching" }).sort({ createdAt: -1 }).toArray();
  const patients = new Set<string>();
  return all.filter((request) => {
    if (patients.has(request.patientId)) return false;
    patients.add(request.patientId);
    return true;
  });
}

export async function GET() {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests, drivers } = await sosCollections();
  const driver = await drivers.findOne({ userId: auth.user.id });
  if (!driver) {
    const openRequests = await getOpenRequests(requests);
    return Response.json({
      available: false,
      activeRequest: null,
      requests: openRequests.map((sos) => ({ id: sos._id, incidentType: sos.incidentType, patientName: sos.patientName, patientPhone: sos.patientPhone, location: sos.location, requiredEquipment: sos.requiredEquipment, createdAt: sos.createdAt, distanceKm: null })),
      message: "Go available to accept an SOS request",
    });
  }
  const activeSos = driver.activeRequestId ? await requests.findOne({ _id: driver.activeRequestId, driverId: auth.user.id, status: "accepted" }) : null;
  const sosRequests = await getOpenRequests(requests);
  return Response.json({
    available: driver.available,
    driverLocation: validCoordinates(driver.location) ? driver.location : null,
    activeRequest: activeSos ? { id: activeSos._id, incidentType: activeSos.incidentType, patientName: activeSos.patientName, patientPhone: activeSos.patientPhone, location: activeSos.location, driverLocation: validCoordinates(driver.location) ? driver.location : null, requiredEquipment: activeSos.requiredEquipment, acceptedAt: activeSos.acceptedAt, arrivedAt: activeSos.arrivedAt ?? null, directionsUrl: mapsUrl(activeSos.location, validCoordinates(driver.location) ? driver.location : undefined) } : null,
    requests: sosRequests.map((sos) => ({ id: sos._id, incidentType: sos.incidentType, patientName: sos.patientName, patientPhone: sos.patientPhone, location: sos.location, requiredEquipment: sos.requiredEquipment, createdAt: sos.createdAt, distanceKm: validCoordinates(driver.location) ? Number(distanceKm(driver.location, sos.location).toFixed(1)) : null })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  let body: { available?: unknown; location?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.available !== "boolean" || (body.location !== undefined && !validCoordinates(body.location))) return Response.json({ error: "available must be boolean and location must contain valid coordinates" }, { status: 400 });
  const { drivers } = await sosCollections();
  if (body.available) {
    const currentDriver = await drivers.findOne({ userId: auth.user.id });
    if (currentDriver?.activeRequestId) return Response.json({ error: "Complete your active SOS request before going back on duty" }, { status: 409 });
  }
  await drivers.updateOne({ userId: auth.user.id }, { $set: { userId: auth.user.id, available: body.available, ...(body.location ? { location: body.location, locationUpdatedAt: new Date() } : {}), updatedAt: new Date() } }, { upsert: true });
  return Response.json({ available: body.available, location: body.location ?? undefined });
}
