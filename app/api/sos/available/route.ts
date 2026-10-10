import { requireRole } from "@/lib/auth-utils";
import { distanceKm, expireAndReofferDriverOffers, mapsUrl, sosCollections, validCoordinates, workflowCollections } from "@/lib/sos";
import clientPromise from "@/lib/mongodb";
import { expireHospitalReservations } from '@/lib/hospital-reservations';
import { ObjectId } from 'mongodb';
import { LOCATION_CHANGE_THRESHOLD_M, LOCATION_PING_SECONDS, LOCATION_RETENTION_SECONDS, POLL_SECONDS, ROUTE_DEVIATION_M, ROUTE_REFRESH_SECONDS, SOS_OFFER_SECONDS, STALE_LOCATION_SECONDS } from '@/lib/dispatch/constants';

export const runtime = "nodejs";
let pingRetentionIndex: Promise<string> | null = null;

async function getOpenRequests(requests: Awaited<ReturnType<typeof sosCollections>>["requests"], driverId?: string) {
  const all = await requests.find(
    { status: "searching", ...(driverId ? { rejectedDriverIds: { $ne: driverId } } : {}) },
    { projection: { _id: 1, type: 1, requestType: 1, incidentType: 1, location: 1, destination: 1, notes: 1, urgency: 1, requiredEquipment: 1, createdAt: 1 } },
  ).sort({ createdAt: -1 }).toArray();
  return all;
}

async function getDriverOffers(
  offers: Awaited<ReturnType<typeof sosCollections>>["offers"],
  sosRequests: Awaited<ReturnType<typeof getOpenRequests>>,
  driverId: string,
  now: Date,
) {
  if (!sosRequests.length) return new Map();
  const rows = await offers.find({
    requestId: { $in: sosRequests.map((request) => request._id) },
    driverId,
    status: { $in: ["offered", "pending"] },
    expiresAt: { $gt: now },
  }).toArray();
  return new Map(rows.map((offer) => [offer.requestId, offer]));
}

function privateOfferCard(sos: Awaited<ReturnType<typeof getOpenRequests>>[number], expiresAt: Date, driverLocation?: { latitude: number; longitude: number } | null) {
  const location = validCoordinates(sos.location)
    ? { latitude: Math.round(sos.location.latitude * 100) / 100, longitude: Math.round(sos.location.longitude * 100) / 100 }
    : null;
  const distance = driverLocation && validCoordinates(sos.location) ? Number(distanceKm(driverLocation, sos.location).toFixed(1)) : null;
  return {
    id: sos._id,
    type: sos.type ?? "sos",
    incidentType: sos.type === "normal" ? "Routine medical transport" : sos.incidentType,
    patientName: sos.type === "normal" ? "Transport request" : "Emergency patient",
    location,
    roughArea: location ? `${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}` : "Approximate area unavailable",
    destination: sos.type === "normal" ? sos.destination?.name ?? "Destination to be confirmed" : undefined,
    notes: sos.type === "normal" ? sos.notes ?? "" : undefined,
    urgency: sos.urgency ?? "urgent",
    requiredEquipment: sos.requiredEquipment ?? [],
    createdAt: sos.createdAt,
    assignmentExpiresAt: expiresAt,
    distanceKm: distance,
  };
}

export async function GET() {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests, drivers, offers } = await sosCollections();
  await expireAndReofferDriverOffers();
  const now = new Date();
  const driver = await drivers.findOne({ userId: auth.user.id });
  const profile = auth.user as typeof auth.user & { ambulanceId?: string; vehicleNumber?: string };
  const driverSummary = { name: auth.user.name, ambulanceId: profile.ambulanceId ?? profile.vehicleNumber ?? driver?.ambulanceId ?? driver?.vehicleNumber ?? null };
  if (!driver) {
    const openRequests = await getOpenRequests(requests, auth.user.id);
    const offersByRequest = await getDriverOffers(offers, openRequests, auth.user.id, now);
    return Response.json({
      available: false,
      activeRequest: null,
      driver: driverSummary,
      requests: openRequests.map((sos) => {
        const offer = offersByRequest.get(sos._id);
        return offer && validCoordinates(sos.location) ? privateOfferCard(sos, offer.expiresAt) : null;
      }).filter(Boolean),
      message: "Go available to accept an SOS request",
      driverLocationFresh: false,
      offerDurationSeconds: SOS_OFFER_SECONDS,
      serverTime: now.toISOString(),
      pollSeconds: POLL_SECONDS,
      locationPingSeconds: LOCATION_PING_SECONDS,
      routeRefreshSeconds: ROUTE_REFRESH_SECONDS,
      routeDeviationM: ROUTE_DEVIATION_M,
    });
  }
  const activeSos = driver.activeRequestId ? await requests.findOne({ _id: driver.activeRequestId, driverId: auth.user.id, status: "accepted" }) : null;
  const open = activeSos ? [] : await getOpenRequests(requests, auth.user.id);
  const offersByRequest = await getDriverOffers(offers, open, auth.user.id, now);
  const sosRequests = open.map((sos) => {
    const offer = offersByRequest.get(sos._id);
    return offer && validCoordinates(sos.location) ? { sos, offer } : null;
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
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
  const driverLocationFresh = Boolean(driverPoint && driver.locationUpdatedAt && now.getTime() - new Date(driver.locationUpdatedAt).getTime() <= STALE_LOCATION_SECONDS * 1000);
  const etaTarget = tripStage === 'patient_on_board' || tripStage === 'en_route_hospital' || tripStage === 'arrived_hospital'
    ? destination ? { latitude: destination.lat, longitude: destination.lng } : undefined
    : activeSos?.location;
  const estimatedEtaMinutes = driverPoint && etaTarget ? Math.max(1, Math.ceil(distanceKm(driverPoint, etaTarget) * 2.5)) + (activeSos?.issue?.etaDelayMinutes ?? 0) : undefined;
  return Response.json({
    available: driver.available,
    availableSince: driver.availableSince ?? driver.updatedAt ?? null,
    driver: driverSummary,
    driverLocation: validCoordinates(driver.location) ? driver.location : null,
    driverLocationFresh,
    offerDurationSeconds: SOS_OFFER_SECONDS,
    driverLocationAccuracyM: (driver as typeof driver & { locationAccuracyM?: number | null }).locationAccuracyM ?? null,
    activeRequest: activeSos ? { id: activeSos._id, type: activeSos.type ?? (activeSos.requestType === "routine" ? "normal" : "sos"), incidentType: activeSos.incidentType, patientName: activeSos.patientName, patientPhone: activeSos.patientPhone, location: activeSos.location, destinationRequest: activeSos.type === "normal" ? activeSos.destination ?? null : null, notes: activeSos.type === "normal" ? activeSos.notes ?? "" : undefined, driverLocation: driverPoint ?? null, driverAccuracyM: (driver as typeof driver & { locationAccuracyM?: number | null }).locationAccuracyM ?? null, distanceKm: driverPoint ? Number(distanceKm(driverPoint, activeSos.location).toFixed(1)) : null, estimatedEtaMinutes, requiredEquipment: activeSos.requiredEquipment, acceptedAt: activeSos.acceptedAt, arrivedAt: activeSos.arrivedAt ?? null, tripStage, tripTimestamps: activeSos.tripTimestamps ?? {}, vitalsUpdate: activeSos.vitalsUpdate ?? null, issue: activeSos.issue ?? null, destination: hospitalRequest ? { id: hospitalRequest.hospitalId, name: hospitalRequest.hospitalName, bedCategory: hospitalRequest.bedCategory, status: hospitalRequest.status, rejectionReason: hospitalRequest.rejectionReason, location: destination ? { latitude: destination.lat, longitude: destination.lng } : undefined } : null, directionsUrl: mapsUrl((tripStage === 'patient_on_board' || tripStage === 'en_route_hospital' || tripStage === 'arrived_hospital') && destination ? { latitude: destination.lat, longitude: destination.lng } : activeSos.location, driverPoint) } : null,
    requests: sosRequests.map(({ sos, offer }) => privateOfferCard(sos, offer.expiresAt, validCoordinates(driver.location) ? driver.location : null)),
    serverTime: now.toISOString(),
    pollSeconds: POLL_SECONDS,
    locationPingSeconds: LOCATION_PING_SECONDS,
    routeRefreshSeconds: ROUTE_REFRESH_SECONDS,
    routeDeviationM: ROUTE_DEVIATION_M,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  let body: { available?: unknown; location?: unknown; accuracyM?: unknown; heading?: unknown; speed?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if ((body.available !== undefined && typeof body.available !== "boolean") || (body.location !== undefined && !validCoordinates(body.location)) || (body.available === undefined && !body.location) || (body.accuracyM !== undefined && (typeof body.accuracyM !== 'number' || !Number.isFinite(body.accuracyM) || body.accuracyM < 0)) || (body.heading !== undefined && body.heading !== null && (typeof body.heading !== 'number' || !Number.isFinite(body.heading) || body.heading < 0 || body.heading > 360)) || (body.speed !== undefined && body.speed !== null && (typeof body.speed !== 'number' || !Number.isFinite(body.speed) || body.speed < 0))) return Response.json({ error: "Provide availability or a valid location heartbeat" }, { status: 400 });
  const { drivers, offers, requests } = await sosCollections();
  if (body.available === undefined) {
    const driver = await drivers.findOne({ userId: auth.user.id });
    const trip = driver?.activeRequestId ? await requests.findOne({ _id: driver.activeRequestId, driverId: auth.user.id, status: 'accepted' }) : null;
    if (!driver?.available && !trip) return Response.json({ error: 'Go available before sharing driver location.' }, { status: 409 });
    const at = new Date();
    const location = body.location as { latitude: number; longitude: number };
    await drivers.updateOne({ userId: auth.user.id }, { $set: { location, locationAccuracyM: body.accuracyM ?? null, locationHeading: body.heading ?? null, locationSpeed: body.speed ?? null, locationUpdatedAt: at, updatedAt: at } });
    if (trip) {
      const db = (await clientPromise).db();
      const pings = db.collection<{ tripId: unknown; driverId: string; lat: number; lng: number; accuracyM: number | null; at: Date }>('driver_location_pings');
      pingRetentionIndex ??= pings.createIndex({ at: 1 }, { expireAfterSeconds: LOCATION_RETENTION_SECONDS, name: 'driver_location_pings_ttl' });
      await pingRetentionIndex;
      const previous = await pings.findOne({ tripId: trip._id, driverId: auth.user.id }, { sort: { at: -1 } });
      const distance = previous ? distanceKm({ latitude: previous.lat, longitude: previous.lng }, location) * 1000 : Infinity;
      if (!previous || (at.getTime() - previous.at.getTime() >= LOCATION_PING_SECONDS * 1000 && distance >= LOCATION_CHANGE_THRESHOLD_M)) {
        await pings.insertOne({ tripId: trip._id, driverId: auth.user.id, lat: location.latitude, lng: location.longitude, accuracyM: typeof body.accuracyM === 'number' ? body.accuracyM : null, at });
      }
    }
    return Response.json({ available: Boolean(driver?.available), location, locationUpdatedAt: at });
  }
  if (body.available) {
    const currentDriver = await drivers.findOne({ userId: auth.user.id });
    if (currentDriver?.activeRequestId) return Response.json({ error: "Complete your active SOS request before going back on duty" }, { status: 409 });
  }
  const changedAt = new Date();
  await drivers.updateOne({ userId: auth.user.id }, { $set: { userId: auth.user.id, available: body.available, ...(body.available ? { availableSince: changedAt } : {}), ...(body.location ? { location: body.location, locationAccuracyM: body.accuracyM ?? null, locationUpdatedAt: changedAt } : {}), updatedAt: changedAt } }, { upsert: true });
  if (!body.available) {
    const pending = await offers.find({ driverId: auth.user.id, status: { $in: ["pending", "offered"] } }).project({ _id: 1, status: 1 }).toArray();
    await Promise.all(pending.map((offer) => offers.updateOne(
      { _id: offer._id, status: offer.status },
      { $set: { status: "expired", respondedAt: changedAt }, $push: { transitionLog: { from: offer.status, to: "expired", at: changedAt, actor: { type: "system", id: "dispatch" }, reason: "Driver went offline" } } },
    )));
  }
  return Response.json({ available: body.available, location: body.location ?? undefined });
}
