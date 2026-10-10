import { requireRole } from "@/lib/auth-utils";
import { chooseBedCategory, createRequestId, distanceKm, sosCollections, validCoordinates, workflowCollections, ensureHospitalRequestForSos } from "@/lib/sos";
import clientPromise from "@/lib/mongodb";
import { expireHospitalReservations } from '@/lib/hospital-reservations';
import { writeHospitalAudit } from '@/lib/hospital-audit';
import { getHoldsCollection, getResourcesCollection, getUsersCollection } from '@/lib/models';
import { resolveHospitalId } from '@/lib/auth-utils';
import { expirePendingHolds } from '@/lib/services/hold-service';
import { ObjectId } from 'mongodb';

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole(["hospital_staff", "hospital"]);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }
  try {
  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  await expireHospitalReservations({ hospitalId: profile.hospitalId, hospitalName: profile.hospitalName });
  const hospitalScope: Record<string, string>[] = [];
  if (profile.hospitalId) hospitalScope.push({ hospitalId: profile.hospitalId });
  if (profile.hospitalName) hospitalScope.push({ hospitalName: profile.hospitalName });
  if (!hospitalScope.length) return Response.json({ error: "Your account is not linked to a hospital." }, { status: 403 });
  const query: Record<string, unknown> = { status: { $in: ["pending", "accepting", "accepted", "rejected"] }, $or: hospitalScope };

  const { hospitalRequests } = await workflowCollections();
  // Older SOS requests may have been saved before the hospital inbox integration.
  // Backfill them idempotently so they appear for hospital staff as well.
  const { requests: sosRequests } = await sosCollections();
  const openSosRequests = await sosRequests.find({ status: { $in: ["searching", "accepted"] } }).limit(100).toArray();
  await Promise.all(openSosRequests.map((request) => ensureHospitalRequestForSos(request).catch(() => null)));
  const requests = await hospitalRequests.find(query).sort({ createdAt: -1 }).limit(100).toArray();
  const { hospitalAdmissions } = await workflowCollections();
  const admissions = requests.length
    ? await hospitalAdmissions.find({ hospitalRequestId: { $in: requests.map((item) => item._id) } }).project({ hospitalRequestId: 1, admittedAt: 1 }).toArray()
    : [];
  const admittedIds = new Set(admissions.map((item) => item.hospitalRequestId));
  const admittedAtById = new Map(admissions.map((item) => [item.hospitalRequestId, item.admittedAt]));
  const sosIds = requests.filter((item) => item.requestType !== 'bed').map((item) => item.sosRequestId);
  const linkedSos = sosIds.length
    ? await sosRequests.find({ _id: { $in: sosIds } }).project({ _id: 1, status: 1, driverId: 1, acceptedAt: 1, location: 1, tripStage: 1, tripTimestamps: 1, vitalsUpdate: 1, issue: 1 }).toArray()
    : [];
  const sosById = new Map(linkedSos.map((item) => [item._id, item]));
  const driverIds = linkedSos.map((item) => item.driverId).filter((item): item is string => Boolean(item));
  const driverById = new Map<string, { location?: { latitude: number; longitude: number } }>();
  if (driverIds.length) {
    const { drivers } = await sosCollections();
    const driversFound = await drivers.find({ userId: { $in: driverIds } }).project({ userId: 1, location: 1 }).toArray();
    for (const driver of driversFound) driverById.set(driver.userId, driver);
  }
  const sharedState = await (await clientPromise).db().collection<{ _id: string; state?: { hospitals?: Array<{ id: string; name?: string; acceptingRequests?: boolean; location?: { lat?: number; lng?: number } }> } }>('appState').findOne({ _id: 'carelink' });
  const linkedHospital = sharedState?.state?.hospitals?.find((item) => (profile.hospitalId && item.id === profile.hospitalId) || (profile.hospitalName && item.name?.toLocaleLowerCase() === profile.hospitalName.toLocaleLowerCase()));
  const hospitalPoint = linkedHospital?.location;
  const destination = hospitalPoint && typeof hospitalPoint.lat === 'number' && typeof hospitalPoint.lng === 'number' ? { latitude: hospitalPoint.lat, longitude: hospitalPoint.lng } : null;
  const formattedRequests = requests.map((item) => {
    const sos = sosById.get(item.sosRequestId);
    const driverLocation = sos?.driverId ? driverById.get(sos.driverId)?.location : undefined;
    const etaMinutes = driverLocation && destination ? Math.max(1, Math.ceil(distanceKm(driverLocation, destination) * 2.5)) : undefined;
    return { ...item, etaMinutes, admitted: admittedIds.has(item._id), admittedAt: admittedAtById.get(item._id), sosStatus: sos?.status, driverAssigned: Boolean(sos?.driverId), driverAcceptedAt: sos?.acceptedAt, driverTripStage: sos?.tripStage ?? item.driverTripStage, driverTripTimestamps: sos?.tripTimestamps, driverVitalsUpdate: sos?.vitalsUpdate ?? item.driverVitalsUpdate, driverIssue: sos?.issue ?? item.driverIssue, location: sos?.location ?? item.location };
  });

  const linkedHospitalId = await resolveHospitalId(profile);
  let bedHoldRequests: Record<string, unknown>[] = [];
  if (linkedHospitalId) {
    await expirePendingHolds(linkedHospitalId);
    const holds = await (await getHoldsCollection()).find({ hospitalId: linkedHospitalId, status: { $in: ['pending', 'queued', 'confirmed', 'fulfilled'] } }).sort({ createdAt: -1 }).limit(100).toArray();
    const patientIds = [...new Set(holds.map((hold) => hold.patientId || hold.requestedByUserId).filter((id): id is string => Boolean(id)))];
    const resourceIds = [...new Set(holds.map((hold) => hold.resourceId))];
    const [users, resources, admissionsForHolds] = await Promise.all([
      patientIds.length ? (await getUsersCollection()).find({ $or: [{ id: { $in: patientIds } }, { _id: { $in: patientIds as never[] } }] }).project({ id: 1, name: 1, phone: 1 }).toArray() : [],
      resourceIds.length ? (await getResourcesCollection()).find({ _id: { $in: resourceIds.map((id) => ObjectId.isValid(id) ? new ObjectId(id) : id as never) } }).project({ category: 1, name: 1 }).toArray() : [],
      holds.length ? hospitalAdmissions.find({ hospitalRequestId: { $in: holds.map((hold) => hold._id?.toString() ?? hold.id) } }).project({ hospitalRequestId: 1, admittedAt: 1 }).toArray() : [],
    ]);
    const userById = new Map(users.flatMap((user) => [[user.id, user], [String(user._id), user]]));
    const resourceById = new Map(resources.map((resource) => [String(resource._id), resource]));
    const admissionById = new Map(admissionsForHolds.map((admission) => [admission.hospitalRequestId, admission]));
    bedHoldRequests = holds.map((hold) => {
      const id = hold._id?.toString() ?? hold.id ?? '';
      const patientId = hold.patientId || hold.requestedByUserId || '';
      const patient = userById.get(patientId);
      const resource = resourceById.get(hold.resourceId);
      const category = String(resource?.category ?? 'general').toLowerCase();
      const bedCategory = category === 'icu' ? 'icu' : category === 'trauma' || category === 'pediatric' ? 'trauma' : category === 'ventilator' || category === 'ventilators' ? 'ventilators' : 'general';
      const admission = admissionById.get(id);
      return {
        _id: id,
        sosRequestId: `BED-${id.slice(-8)}`,
        holdId: id,
        requestType: 'bed',
        isRecommendation: Boolean(hold.recommendationRequestKey),
        responseDeadline: hold.recommendationResponseDeadline,
        hospitalId: hold.hospitalId,
        hospitalName: profile.hospitalName ?? '',
        patientId,
        patientName: hold.patientDetails?.name ?? patient?.name ?? 'Patient',
        patientPhone: patient?.phone,
        incidentType: hold.patientDetails?.conditionSummary ?? 'Hospital bed request',
        requiredEquipment: [resource?.name ?? category.replaceAll('_', ' ')],
        bedCategory,
        status: hold.status === 'confirmed' || hold.status === 'fulfilled' ? 'accepted' : hold.status === 'queued' ? 'queued' : 'pending',
        createdAt: hold.createdAt,
        admitted: Boolean(admission) || hold.status === 'fulfilled',
        admittedAt: admission?.admittedAt ?? hold.fulfilledAt,
        etaMinutes: hold.patientDetails?.etaMinutes,
        acceptedAt: hold.confirmedAt,
        queuePosition: hold.queuePosition,
        reservationExpiresAt: hold.expiresAt,
      };
    });
  }

  return Response.json({ requests: [...bedHoldRequests, ...formattedRequests], acceptingRequests: linkedHospital ? linkedHospital.acceptingRequests !== false : null });
  } catch (error) {
    console.error('Could not load hospital requests:', error);
    return Response.json({ error: 'Could not load incoming cases. Please refresh and try again.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  let body: { hospitalId?: unknown; hospitalName?: unknown; location?: unknown; incidentType?: unknown; requiredEquipment?: unknown; bedType?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.hospitalId !== "string" || !body.hospitalId.trim()) {
    return Response.json({ error: "hospitalId is required" }, { status: 400 });
  }
  if (!validCoordinates(body.location)) {
    return Response.json({ error: "A valid patient location is required" }, { status: 400 });
  }
  const patientLocation = body.location;
  const incidentType = typeof body.incidentType === "string" && body.incidentType.trim()
    ? body.incidentType.trim().slice(0, 120)
    : "Hospital bed requested";
  const requiredEquipment = Array.isArray(body.requiredEquipment)
    ? [...new Set(body.requiredEquipment.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];

  const database = (await clientPromise).db();
  const sharedState = await database.collection<{ _id: string; state?: { hospitals?: Array<Record<string, unknown>> } }>("appState").findOne({ _id: "carelink" });
  const appHospital = process.env.NODE_ENV === "development"
    ? sharedState?.state?.hospitals?.find((hospital) => hospital.id === body.hospitalId) as Record<string, unknown> | undefined
    : undefined;
  const { hospitals } = await sosCollections();
  const candidates = await hospitals.find({ status: { $ne: "inactive" } }).toArray();
  const nearest = candidates.flatMap((hospital) => {
    const raw = hospital.location as unknown as { latitude?: unknown; longitude?: unknown; coordinates?: unknown };
    const point = typeof raw?.latitude === "number" && typeof raw.longitude === "number"
      ? { latitude: raw.latitude, longitude: raw.longitude }
      : Array.isArray(raw?.coordinates) && typeof raw.coordinates[0] === "number" && typeof raw.coordinates[1] === "number"
        ? { latitude: raw.coordinates[1], longitude: raw.coordinates[0] }
        : null;
    return point ? [{ hospital, distance: distanceKm(patientLocation, point) }] : [];
  }).sort((a, b) => a.distance - b.distance)[0];
  const targetHospital = appHospital
    ? { id: String(appHospital.id), name: String(appHospital.name), beds: appHospital.beds, inventorySource: "app-state" as const }
    : nearest
      ? { id: String(nearest.hospital._id), name: nearest.hospital.name, beds: undefined, inventorySource: undefined }
      : null;
  if (!targetHospital) {
    return Response.json({ error: "No hospital is registered to receive bed requests yet." }, { status: 503 });
  }

  const { hospitalRequests, notifications } = await workflowCollections();
  const existing = await hospitalRequests.findOne({
    patientId: auth.user.id,
    hospitalId: targetHospital.id,
    requestType: "bed",
    status: { $in: ["pending", "accepting", "accepted"] },
  });
  if (existing) return Response.json({ request: existing, existing: true });

  const now = new Date();
  const bedRequest = {
    _id: createRequestId(),
    sosRequestId: `BED-${createRequestId()}`,
    requestType: "bed" as const,
    hospitalId: targetHospital.id,
    hospitalName: targetHospital.name,
    inventorySource: targetHospital.inventorySource,
    bedCategory: targetHospital.inventorySource ? (typeof body.bedType === 'string' && ['general', 'icu', 'trauma', 'ventilators'].includes(body.bedType) ? body.bedType as 'general' | 'icu' | 'trauma' | 'ventilators' : chooseBedCategory(requiredEquipment, targetHospital.beds)) : undefined,
    requestedHospitalId: body.hospitalId.trim(),
    requestedHospitalName: typeof body.hospitalName === "string" ? body.hospitalName.slice(0, 120) : undefined,
    patientId: auth.user.id,
    patientName: auth.user.name,
    patientPhone: (auth.user as typeof auth.user & { phone?: string }).phone,
    location: patientLocation,
    incidentType,
    requiredEquipment,
    status: "pending" as const,
    createdAt: now,
    updatedAt: now,
  };
  await hospitalRequests.insertOne(bedRequest);
  await writeHospitalAudit({ hospitalId: targetHospital.id, hospitalName: targetHospital.name, actorId: auth.user.id, actorName: auth.user.name, action: 'Patient bed request sent', entityType: 'request', entityId: bedRequest._id, details: { bedCategory: bedRequest.bedCategory, sosRequestId: bedRequest.sosRequestId }, createdAt: now });
  await notifications.updateOne({ _id: `hospital-request-sent-${bedRequest._id}` }, { $setOnInsert: { _id: `hospital-request-sent-${bedRequest._id}`, recipientId: auth.user.id, type: 'hospital_request_pending', title: 'Hospital request sent', message: `Your ${bedRequest.bedCategory || 'bed'} request was sent to ${targetHospital.name} and is pending hospital confirmation.`, relatedRequestId: bedRequest.sosRequestId, createdAt: now } }, { upsert: true });
  return Response.json({ request: bedRequest, message: "Bed request sent to the hospital." }, { status: 201 });
}
