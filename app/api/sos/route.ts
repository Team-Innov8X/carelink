import { requireRole } from "@/lib/auth-utils";
import { createRequestId, ensureHospitalRequestForSos, getHospitalRequestsCollection, sosCollections, validCoordinates, workflowCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = performance.now();
  const authStartedAt = performance.now();
  const auth = await requireRole(["patient", "dispatcher"]);
  const authMs = performance.now() - authStartedAt;
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const collectionStartedAt = performance.now();
  const [{ requests }, hospitalRequests] = await Promise.all([sosCollections(), getHospitalRequestsCollection()]);
  const collectionMs = performance.now() - collectionStartedAt;
  const role = (auth.user as { role?: string }).role;
  const query = role === "dispatcher" ? {} : { patientId: auth.user.id };
  const requestQueryStartedAt = performance.now();
  const patientProjection = role === "dispatcher" ? undefined : {
    _id: 1, patientId: 1, patientName: 1, patientPhone: 1, status: 1, incidentType: 1,
    createdAt: 1, acceptedAt: 1, arrivedAt: 1, completedAt: 1, driverId: 1,
    requiredEquipment: 1, tripStage: 1, tripTimestamps: 1, vitalsUpdate: 1, issue: 1,
  };
  const items = await requests.find(query, patientProjection ? { projection: patientProjection } : undefined).sort({ createdAt: -1 }).limit(50).toArray();
  const requestQueryMs = performance.now() - requestQueryStartedAt;
  const hospitalQueryStartedAt = performance.now();
  const linkedHospitalRequests = items.length ? await hospitalRequests.find(
    { sosRequestId: { $in: items.map((item) => item._id) } },
    { projection: { sosRequestId: 1, hospitalName: 1, status: 1, bedCategory: 1, rejectionReason: 1 } },
  ).toArray() : [];
  const hospitalQueryMs = performance.now() - hospitalQueryStartedAt;
  if (process.env.CARELINK_PERF_LOGS === "1") console.info(JSON.stringify({ event: "carelink.perf", name: "sos_get", authMs: Math.round(authMs * 100) / 100, collectionAndIndexMs: Math.round(collectionMs * 100) / 100, sosQueryMs: Math.round(requestQueryMs * 100) / 100, hospitalRequestQueryMs: Math.round(hospitalQueryMs * 100) / 100, totalMs: Math.round((performance.now() - startedAt) * 100) / 100, requestCount: items.length, role }));
  const hospitalBySosId = new Map(linkedHospitalRequests.map((item) => [item.sosRequestId, item]));
  return Response.json({ requests: items.map((item) => ({
    id: item._id,
    status: item.status,
    incidentType: item.incidentType,
    requestType: item.requestType ?? (/^Routine Transport:/i.test(item.incidentType) ? 'routine' : 'emergency'),
    patientName: item.patientName,
    patientPhone: item.patientPhone,
    requiredEquipment: item.requiredEquipment,
    preferredTime: item.preferredTime,
    notes: item.notes,
    createdAt: item.createdAt,
    acceptedAt: item.acceptedAt,
    tripStage: item.tripStage,
    tripTimestamps: item.tripTimestamps,
    vitalsUpdate: item.vitalsUpdate,
    issue: item.issue,
    destination: (() => { const target = hospitalBySosId.get(item._id); return target ? { name: target.hospitalName, status: target.status, bedCategory: target.bedCategory, rejectionReason: target.rejectionReason } : null; })(),
    driverAssigned: Boolean(item.driverId),
  })) });
}

export async function POST(request: Request) {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });

  let body: { location?: unknown; incidentType?: unknown; requiredEquipment?: unknown; requestType?: unknown; preferredTime?: unknown; notes?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const patientLocation = body.location;
  if (!validCoordinates(patientLocation)) return Response.json({ error: "location must include valid latitude and longitude" }, { status: 400 });
  const incidentType = body.incidentType === undefined ? "Emergency assistance requested" : body.incidentType;
  if (typeof incidentType !== "string" || incidentType.trim().length < 2 || incidentType.length > 120) {
    return Response.json({ error: "incidentType must be between 2 and 120 characters" }, { status: 400 });
  }
  if (body.requiredEquipment !== undefined && (!Array.isArray(body.requiredEquipment) || body.requiredEquipment.some((item) => typeof item !== "string" || item.length > 80))) {
    return Response.json({ error: "requiredEquipment must be an array of strings" }, { status: 400 });
  }
  const requestedType = body.requestType === undefined ? 'emergency' : body.requestType;
  if (requestedType !== 'emergency' && requestedType !== 'routine') return Response.json({ error: 'requestType must be emergency or routine' }, { status: 400 });
  const requestType: 'emergency' | 'routine' = requestedType;
  if (body.preferredTime !== undefined && (typeof body.preferredTime !== 'string' || body.preferredTime.length > 120)) return Response.json({ error: 'preferredTime must be 120 characters or fewer' }, { status: 400 });
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 1000)) return Response.json({ error: 'notes must be 1,000 characters or fewer' }, { status: 400 });

  const { requests } = await sosCollections();
  const existing = await requests.findOne({ patientId: auth.user.id, status: { $in: ["searching", "accepted"] } });
  if (existing) {
    const hospitalRequest = await ensureHospitalRequestForSos(existing).catch(() => null);
    return Response.json({
      request: { id: existing._id, status: existing.status, createdAt: existing.createdAt },
      hospitalRequestId: hospitalRequest?._id ?? null,
      message: "You already have an active emergency request",
      existing: true,
    });
  }
  const profile = auth.user as typeof auth.user & { email?: string; phone?: string };
  const sos = {
    _id: createRequestId(), patientId: auth.user.id, patientName: auth.user.name,
    patientEmail: profile.email, patientPhone: profile.phone,
    location: patientLocation, incidentType: incidentType.trim(),
    requiredEquipment: [...new Set(((body.requiredEquipment ?? []) as string[]).map((item) => item.trim()).filter(Boolean))],
    requestType,
    preferredTime: typeof body.preferredTime === 'string' ? body.preferredTime.trim() : undefined,
    notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
    status: "searching" as const, driverId: null, createdAt: new Date(),
  };
  await requests.insertOne(sos);

  const { drivers } = await sosCollections();
  const activeDrivers = await drivers.find({ available: true, lastSeenAt: { $gte: new Date(Date.now() - 30_000) }, activeRequestId: { $exists: false } }).toArray();
  if (activeDrivers.length) {
    try {
      const { notifications } = await workflowCollections();
      const createdAt = new Date();
      await Promise.all(activeDrivers.map((driver) => notifications.updateOne(
        { _id: `driver-request-${sos._id}-${driver.userId}` },
        { $setOnInsert: {
          _id: `driver-request-${sos._id}-${driver.userId}`,
          recipientId: driver.userId,
          type: requestType === 'routine' ? 'routine_transport_request' : 'sos_driver_offer',
          title: requestType === 'routine' ? 'Routine transport request nearby' : 'Emergency SOS nearby',
          message: `${sos.patientName} needs ${sos.incidentType}. Open the driver dashboard to review the pickup.`,
          relatedRequestId: sos._id,
          createdAt,
        } },
        { upsert: true },
      )));
    } catch (error) {
      console.error('Could not create driver notifications for SOS request:', error);
    }
  }

  const hospitalRequest = requestType === 'routine' ? null : await ensureHospitalRequestForSos(sos).catch(() => null);
  const hospitalRequestId = hospitalRequest?._id ?? null;

  return Response.json({
    request: { id: sos._id, status: sos.status, createdAt: sos.createdAt },
    hospitalRequestId,
    message: requestType === 'routine'
      ? 'Routine transport request sent to the driver fleet.'
      : hospitalRequestId
      ? "SOS sent to ambulance drivers and the nearest hospital."
      : "SOS sent to available ambulance drivers; no active hospital is registered yet.",
  }, { status: 201 });
}
