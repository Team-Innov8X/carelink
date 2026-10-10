import { requireRole } from "@/lib/auth-utils";
import { distanceKm, expireAndReofferDriverOffers, mapsUrl, sosCollections, validCoordinates, workflowCollections } from "@/lib/sos";
import clientPromise from "@/lib/mongodb";
import { expireHospitalReservations } from '@/lib/hospital-reservations';
import { ObjectId } from 'mongodb';
import type { Filter } from 'mongodb';
import type { SosRequest } from '@/lib/sos';

export const runtime = "nodejs";

async function getOpenRequests(requests: Awaited<ReturnType<typeof sosCollections>>["requests"], driverId?: string, requestType: 'emergency' | 'routine' = 'emergency') {
  const typeFilter: Filter<SosRequest> = requestType === 'routine'
    ? { $or: [{ requestType: 'routine' }, { requestType: { $exists: false }, incidentType: /^Routine Transport:/i }] }
    : { $or: [{ requestType: 'emergency' }, { requestType: { $exists: false }, incidentType: { $not: /^Routine Transport:/i } }] };
  const filter: Filter<SosRequest> = { status: 'searching', $and: [typeFilter, ...(driverId ? [
    { rejectedDriverIds: { $ne: driverId } },
    { $or: [{ assignedDriverId: driverId }, { assignedDriverId: { $exists: false } }] },
  ] : [])] };
  const all = await requests.find(filter).sort({ createdAt: -1 }).toArray();
  const patients = new Set<string>();
  return all.filter((request) => {
    if (patients.has(request.patientId)) return false;
    patients.add(request.patientId);
    return true;
  });
}

export async function GET(request: Request) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests, drivers } = await sosCollections();
  const requestType: 'emergency' | 'routine' = new URL(request.url).searchParams.get('requestType') === 'routine' ? 'routine' : 'emergency';
  const now = new Date();
  await expireAndReofferDriverOffers();
  await drivers.updateMany({ userId: auth.user.id, pendingOfferExpiresAt: { $lte: now } }, { $unset: { pendingOfferRequestId: '', pendingOfferExpiresAt: '' } });
  const driver = await drivers.findOne({ userId: auth.user.id });
  const lastSeenAt = driver?.lastSeenAt instanceof Date ? driver.lastSeenAt : null;
  const heartbeatFresh = Boolean(lastSeenAt && now.getTime() - lastSeenAt.getTime() <= 30_000);
  if (driver?.available && !heartbeatFresh) {
    await drivers.updateOne({ userId: auth.user.id, available: true }, { $set: { available: false, updatedAt: now } });
    driver.available = false;
  }
  const profile = auth.user as typeof auth.user & { ambulanceId?: string; vehicleNumber?: string };
  const driverSummary = {
    name: auth.user.name,
    ambulanceId: profile.ambulanceId ?? profile.vehicleNumber ?? driver?.ambulanceId ?? driver?.vehicleNumber ?? null,
    vehicleType: driver?.vehicleType ?? null,
  };
  if (!driver) {
    const openRequests = await getOpenRequests(requests, auth.user.id, requestType);
    return Response.json({
      available: false,
      activeRequest: null,
      driver: driverSummary,
      requests: openRequests.map((sos) => ({ id: sos._id, incidentType: sos.incidentType, requestType: sos.requestType ?? 'emergency', patientName: sos.patientName, patientPhone: sos.patientPhone, location: sos.location, requiredEquipment: sos.requiredEquipment, createdAt: sos.createdAt, assignmentExpiresAt: sos.assignmentExpiresAt, distanceKm: null })),
      message: "Go available to accept an SOS request",
    });
  }
  const activeSos = driver.activeRequestId ? await requests.findOne({ _id: driver.activeRequestId, driverId: auth.user.id, status: "accepted" }) : null;
  const sosRequests = activeSos ? [] : await getOpenRequests(requests, auth.user.id, requestType);
  const { hospitalRequests } = await workflowCollections();
  let hospitalRequest = activeSos ? await hospitalRequests.findOne({ sosRequestId: activeSos._id }) : null;
  if (hospitalRequest) {
    await expireHospitalReservations({ hospitalId: hospitalRequest.hospitalId, hospitalName: hospitalRequest.hospitalName });
    hospitalRequest = await hospitalRequests.findOne({ _id: hospitalRequest._id });
  }
  const hospitalState = process.env.NODE_ENV === "development" && hospitalRequest?.inventorySource === "app-state"
    ? await (await clientPromise).db().collection<{ _id: string; state?: { hospitals?: Array<{ id: string; location?: { lat: number; lng: number; address: string } }> } }>("appState").findOne({ _id: "carelink" })
    : null;
  const appDestination = hospitalRequest ? hospitalState?.state?.hospitals?.find((item) => item.id === hospitalRequest.hospitalId)?.location : null;
  const hospitalDirectory = hospitalRequest && !appDestination
    ? await (await clientPromise).db().collection<{ location?: unknown }>('hospitals').findOne({ _id: (ObjectId.isValid(hospitalRequest.hospitalId) ? new ObjectId(hospitalRequest.hospitalId) : hospitalRequest.hospitalId) as never })
    : null;
  const rawLocation = hospitalDirectory?.location as { latitude?: unknown; longitude?: unknown; coordinates?: unknown } | undefined;
  const destination = appDestination ? { lat: appDestination.lat, lng: appDestination.lng, address: appDestination.address } : rawLocation && typeof rawLocation.latitude === 'number' && typeof rawLocation.longitude === 'number' ? { lat: rawLocation.latitude, lng: rawLocation.longitude, address: '' } : rawLocation && Array.isArray(rawLocation.coordinates) && typeof rawLocation.coordinates[0] === 'number' && typeof rawLocation.coordinates[1] === 'number' ? { lat: rawLocation.coordinates[1], lng: rawLocation.coordinates[0], address: '' } : null;
  const tripStage = activeSos?.tripStage ?? (activeSos?.arrivedAt ? 'arrived_patient' : 'accepted');
  const driverPoint = driver && validCoordinates(driver.location) ? driver.location : undefined;
  const etaTarget = tripStage === 'en_route_hospital' || tripStage === 'arrived_hospital'
    ? destination ? { latitude: destination.lat, longitude: destination.lng } : undefined
    : activeSos?.location;
  const estimatedEtaMinutes = driverPoint && etaTarget ? Math.max(1, Math.ceil(distanceKm(driverPoint, etaTarget) * 2.5)) + (activeSos?.issue?.etaDelayMinutes ?? 0) : undefined;
  return Response.json({
    available: driver.available,
    availableSince: driver.availableSince ?? driver.updatedAt ?? null,
    driver: driverSummary,
    driverLocation: validCoordinates(driver.location) ? driver.location : null,
    activeRequest: activeSos ? { id: activeSos._id, incidentType: activeSos.incidentType, requestType: activeSos.requestType ?? 'emergency', patientName: activeSos.patientName, patientPhone: activeSos.patientPhone, location: activeSos.location, driverLocation: driverPoint ?? null, distanceKm: driverPoint ? Number(distanceKm(driverPoint, activeSos.location).toFixed(1)) : null, estimatedEtaMinutes, requiredEquipment: activeSos.requiredEquipment, acceptedAt: activeSos.acceptedAt, arrivedAt: activeSos.arrivedAt ?? null, tripStage, tripTimestamps: activeSos.tripTimestamps ?? {}, vitalsUpdate: activeSos.vitalsUpdate ?? null, issue: activeSos.issue ?? null, destination: hospitalRequest ? { id: hospitalRequest.hospitalId, name: hospitalRequest.hospitalName, bedCategory: hospitalRequest.bedCategory, status: hospitalRequest.status, rejectionReason: hospitalRequest.rejectionReason, location: destination ? { latitude: destination.lat, longitude: destination.lng } : undefined } : null, directionsUrl: mapsUrl((tripStage === 'en_route_hospital' || tripStage === 'arrived_hospital') && destination ? { latitude: destination.lat, longitude: destination.lng } : activeSos.location, driverPoint) } : null,
    requests: sosRequests.map((sos) => ({ id: sos._id, incidentType: sos.incidentType, requestType: sos.requestType ?? 'emergency', patientName: sos.patientName, patientPhone: sos.patientPhone, location: sos.location, requiredEquipment: sos.requiredEquipment, createdAt: sos.createdAt, assignmentExpiresAt: sos.assignmentExpiresAt, distanceKm: validCoordinates(driver.location) ? Number(distanceKm(driver.location, sos.location).toFixed(1)) : null })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  let body: { available?: unknown; location?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if ((body.available !== undefined && typeof body.available !== "boolean") || (body.location !== undefined && !validCoordinates(body.location)) || (body.available === undefined && body.location === undefined)) return Response.json({ error: "Provide an availability state, a valid location, or both" }, { status: 400 });
  const { drivers } = await sosCollections();
  if (body.available === true) {
    const currentDriver = await drivers.findOne({ userId: auth.user.id });
    const profile = auth.user as typeof auth.user & { vehicleNumber?: string };
    if (!(profile.vehicleNumber || currentDriver?.ambulanceId || currentDriver?.vehicleNumber) || !currentDriver?.vehicleType) {
      return Response.json({ error: 'Add your ambulance registration and type before going available.' }, { status: 409 });
    }
    if (currentDriver?.activeRequestId) return Response.json({ error: "Complete your active SOS request before going back on duty" }, { status: 409 });
  }
  const now = new Date();
  const updates: Record<string, unknown> = { userId: auth.user.id, updatedAt: now };
  if (body.available !== undefined) updates.available = body.available;
  if (body.available === true) updates.availableSince = now;
  if (body.location) {
    updates.location = body.location;
    updates.locationUpdatedAt = now;
    updates.lastSeenAt = now;
  }
  await drivers.updateOne({ userId: auth.user.id }, { $set: updates }, { upsert: true });
  return Response.json({ available: body.available, location: body.location ?? undefined, lastSeenAt: body.location ? now : undefined });
}
