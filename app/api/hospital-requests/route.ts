import { requireRole } from "@/lib/auth-utils";
import { chooseBedCategory, chooseRequiredSpecialty, createRequestId, distanceKm, sosCollections, validCoordinates, workflowCollections, ensureHospitalRequestForSos } from "@/lib/sos";
import connectMongo from "@/lib/mongodb";
import { expireHospitalReservations } from '@/lib/hospital-reservations';
import { writeHospitalAudit } from '@/lib/hospital-audit';

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole(["hospital_staff", "hospital"]);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  await expireHospitalReservations({ hospitalId: profile.hospitalId, hospitalName: profile.hospitalName });
  const query: Record<string, unknown> = { status: { $in: ["pending", "accepting", "accepted", "rejected"] } };
  if (profile.hospitalId && profile.hospitalName) query.$or = [
    { hospitalId: profile.hospitalId },
    { hospitalName: profile.hospitalName },
  ];
  else if (profile.hospitalId) query.hospitalId = profile.hospitalId;
  else if (profile.hospitalName) query.hospitalName = profile.hospitalName;
  else return Response.json({ error: "Your account is not linked to a hospital." }, { status: 403 });

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
  const sharedState = await (await connectMongo()).db().collection<{ _id: string; state?: { hospitals?: Array<{ id: string; name?: string; location?: { lat?: number; lng?: number } }> } }>('appState').findOne({ _id: 'carelink' });
  const hospitalPoint = sharedState?.state?.hospitals?.find((item) => profile.hospitalId ? item.id === profile.hospitalId : item.name === profile.hospitalName)?.location;
  const destination = hospitalPoint && typeof hospitalPoint.lat === 'number' && typeof hospitalPoint.lng === 'number' ? { latitude: hospitalPoint.lat, longitude: hospitalPoint.lng } : null;
  return Response.json({ requests: requests.map((item) => {
    const sos = sosById.get(item.sosRequestId);
    const driverLocation = sos?.driverId ? driverById.get(sos.driverId)?.location : undefined;
    const etaMinutes = driverLocation && destination ? Math.max(1, Math.ceil(distanceKm(driverLocation, destination) * 2.5)) : undefined;
    return { ...item, etaMinutes, admitted: admittedIds.has(item._id), admittedAt: admittedAtById.get(item._id), sosStatus: sos?.status, driverAssigned: Boolean(sos?.driverId), driverAcceptedAt: sos?.acceptedAt, driverTripStage: sos?.tripStage ?? item.driverTripStage, driverTripTimestamps: sos?.tripTimestamps, driverVitalsUpdate: sos?.vitalsUpdate ?? item.driverVitalsUpdate, driverIssue: sos?.issue ?? item.driverIssue, location: sos?.location ?? item.location };
  }) });
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

  const database = (await connectMongo()).db();
  const sharedState = await database.collection<{ _id: string; state?: { hospitals?: Array<Record<string, unknown>> } }>("appState").findOne({ _id: "carelink" });
  const appHospital = sharedState?.state?.hospitals?.find((hospital) => hospital.id === body.hospitalId) as Record<string, unknown> | undefined;
  const { hospitals } = await sosCollections();
  const candidates = await hospitals.find({ status: { $ne: "inactive" } }).toArray();
  const requestedName = typeof body.hospitalName === "string" ? body.hospitalName.trim() : "";
  const registeredHospital = requestedName
    ? candidates.find((hospital) => hospital.name.trim().toLowerCase() === requestedName.toLowerCase())
    : undefined;
  const targetHospital = appHospital
    ? {
        id: String(appHospital.id),
        name: registeredHospital?.name ?? String(appHospital.name),
        beds: appHospital.beds,
        inventorySource: "app-state" as const,
      }
    : registeredHospital
      ? { id: String(registeredHospital._id), name: registeredHospital.name, beds: undefined, inventorySource: undefined }
      : null;
  if (!targetHospital) {
    return Response.json({ error: "The selected hospital is no longer available. Refresh the hospital list and try again." }, { status: 404 });
  }

  const { hospitalRequests, notifications } = await workflowCollections();
  const existing = await hospitalRequests.findOne({
    patientId: auth.user.id,
    hospitalId: targetHospital.id,
    requestType: "bed",
    status: { $in: ["pending", "accepting", "accepted"] },
  });
  if (existing) return Response.json({
    request: existing,
    existing: true,
    message: existing.status === "accepted"
      ? `${existing.hospitalName} has already accepted this request.`
      : "A request has already been created for you at this hospital.",
  });

  const now = new Date();
  const bedRequest = {
    _id: createRequestId(),
    sosRequestId: `BED-${createRequestId()}`,
    requestType: "bed" as const,
    hospitalId: targetHospital.id,
    hospitalName: targetHospital.name,
    inventorySource: targetHospital.inventorySource,
    bedCategory: targetHospital.inventorySource ? (typeof body.bedType === 'string' && ['general', 'icu', 'trauma', 'ventilators'].includes(body.bedType) ? body.bedType as 'general' | 'icu' | 'trauma' | 'ventilators' : chooseBedCategory([incidentType, ...requiredEquipment], targetHospital.beds)) : undefined,
    requiredSpecialty: chooseRequiredSpecialty(incidentType, requiredEquipment, appHospital?.specialties ?? registeredHospital?.specialties),
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
