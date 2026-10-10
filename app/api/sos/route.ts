import { requireRole } from "@/lib/auth-utils";
import { advanceDispatch, createRequestId, ensureHospitalRequestForSos, getHospitalRequestsCollection, sosCollections, validCoordinates } from "@/lib/sos";
import { getUsersCollection } from "@/lib/models/db";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = performance.now();
  const authStartedAt = performance.now();
  const auth = await requireRole(["patient", "dispatcher"]);
  const authMs = performance.now() - authStartedAt;
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const collectionStartedAt = performance.now();
  const [collections, hospitalRequests] = await Promise.all([sosCollections(), getHospitalRequestsCollection()]);
  const { requests, drivers } = collections;
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
  await Promise.all(items.filter((item) => item.status === "searching").map((item) => advanceDispatch(item._id)));
  const requestQueryMs = performance.now() - requestQueryStartedAt;
  const hospitalQueryStartedAt = performance.now();
  const linkedHospitalRequests = items.length ? await hospitalRequests.find(
    { sosRequestId: { $in: items.map((item) => item._id) } },
    { projection: { sosRequestId: 1, hospitalName: 1, status: 1, bedCategory: 1, rejectionReason: 1 } },
  ).toArray() : [];
  const hospitalQueryMs = performance.now() - hospitalQueryStartedAt;
  if (process.env.CARELINK_PERF_LOGS === "1") console.info(JSON.stringify({ event: "carelink.perf", name: "sos_get", authMs: Math.round(authMs * 100) / 100, collectionAndIndexMs: Math.round(collectionMs * 100) / 100, sosQueryMs: Math.round(requestQueryMs * 100) / 100, hospitalRequestQueryMs: Math.round(hospitalQueryMs * 100) / 100, totalMs: Math.round((performance.now() - startedAt) * 100) / 100, requestCount: items.length, role }));
  const hospitalBySosId = new Map(linkedHospitalRequests.map((item) => [item.sosRequestId, item]));
  const driverIds = items.map((item) => item.driverId).filter((id): id is string => Boolean(id));
  const driverRows = driverIds.length ? await drivers.find({ userId: { $in: driverIds } }).project({ userId: 1, location: 1, vehicleNumber: 1, ambulanceId: 1, ambulanceType: 1 }).toArray() : [];
  const userRows = driverIds.length ? await (await getUsersCollection()).find({ id: { $in: driverIds } }).project({ id: 1, name: 1, vehicleNumber: 1 }).toArray() : [];
  const driverById = new Map(driverRows.map((driver) => [driver.userId, driver]));
  const driverProfileById = new Map(userRows.map((user) => [user.id, user]));
  return Response.json({ requests: items.map((item) => ({
    id: item._id,
    status: item.status,
    incidentType: item.incidentType,
    requestType: item.requestType ?? 'emergency',
    preferredTime: item.preferredTime,
    notes: item.notes,
    patientName: item.patientName,
    passengerName: item.passengerName,
    patientPhone: item.patientPhone,
    location: item.location,
    requiredEquipment: item.requiredEquipment,
    createdAt: item.createdAt,
    acceptedAt: item.acceptedAt,
    tripStage: item.tripStage,
    tripTimestamps: item.tripTimestamps,
    vitalsUpdate: item.vitalsUpdate,
    issue: item.issue,
    destination: (() => { const target = hospitalBySosId.get(item._id); return target ? { name: target.hospitalName, status: target.status, bedCategory: target.bedCategory, rejectionReason: target.rejectionReason } : null; })(),
    hospitalRequest: (() => { const target = hospitalBySosId.get(item._id); return target ? { status: target.status, hospitalName: target.hospitalName, acceptedAt: target.acceptedAt, bedCategory: target.bedCategory } : null; })(),
    driverAssigned: Boolean(item.driverId),
    driver: item.driverId ? (() => { const driver = driverById.get(item.driverId); const profile = driverProfileById.get(item.driverId); return driver ? { name: profile?.name ?? 'Assigned driver', vehicleNumber: profile?.vehicleNumber ?? driver.vehicleNumber ?? driver.ambulanceId ?? null, ambulanceType: driver.ambulanceType ?? null, location: driver.location ?? null } : null; })() : null,
  })) });
}

export async function POST(request: Request) {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });

  let body: { location?: unknown; incidentType?: unknown; requiredEquipment?: unknown; requestType?: unknown; patientPhone?: unknown; patientName?: unknown; preferredTime?: unknown; notes?: unknown };
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
  if (body.requestType !== undefined && body.requestType !== 'emergency' && body.requestType !== 'routine') return Response.json({ error: 'requestType must be emergency or routine' }, { status: 400 });
  if (body.patientPhone !== undefined && (typeof body.patientPhone !== 'string' || body.patientPhone.trim().length < 7 || body.patientPhone.length > 40)) return Response.json({ error: 'patientPhone must be a valid contact number' }, { status: 400 });
  if (body.patientName !== undefined && (typeof body.patientName !== 'string' || body.patientName.trim().length < 1 || body.patientName.length > 120)) return Response.json({ error: 'patientName must be a valid name' }, { status: 400 });
  if (body.preferredTime !== undefined && (typeof body.preferredTime !== 'string' || body.preferredTime.length > 120)) return Response.json({ error: 'preferredTime is too long' }, { status: 400 });
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 2000)) return Response.json({ error: 'notes must be 2000 characters or fewer' }, { status: 400 });

  const { requests } = await sosCollections();
  const requestType: 'emergency' | 'routine' = body.requestType === 'routine' ? 'routine' : 'emergency';
  const existing = requestType === 'routine' ? null : await requests.findOne({ patientId: auth.user.id, status: { $in: ["searching", "accepted"] }, requestType: { $ne: 'routine' } });
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
    passengerName: requestType === 'routine' && typeof body.patientName === 'string' ? body.patientName.trim() : auth.user.name,
    patientEmail: profile.email, patientPhone: requestType === 'routine' && typeof body.patientPhone === 'string' ? body.patientPhone.trim() : profile.phone,
    location: patientLocation, incidentType: incidentType.trim(),
    requestType,
    preferredTime: typeof body.preferredTime === 'string' ? body.preferredTime.trim() : undefined,
    notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
    requiredEquipment: [...new Set(((body.requiredEquipment ?? []) as string[]).map((item) => item.trim()).filter(Boolean))],
    status: "searching" as const, driverId: null, dispatchRound: 0, createdAt: new Date(),
  };
  await requests.insertOne(sos);
  await advanceDispatch(sos._id);

  const hospitalRequest = requestType === 'routine' ? null : await ensureHospitalRequestForSos(sos).catch(() => null);
  const hospitalRequestId = hospitalRequest?._id ?? null;

  return Response.json({
    request: { id: sos._id, status: sos.status, createdAt: sos.createdAt },
    hospitalRequestId,
    message: hospitalRequestId
      ? "SOS sent to ambulance drivers and the nearest hospital."
      : "SOS sent to available ambulance drivers; no active hospital is registered yet.",
  }, { status: 201 });
}
