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
  const [{ requests, drivers }, hospitalRequests] = await Promise.all([sosCollections(), getHospitalRequestsCollection()]);
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
  const driverRows = driverIds.length ? await (await sosCollections()).drivers.find({ userId: { $in: driverIds } }).project({ userId: 1, location: 1, vehicleNumber: 1 }).toArray() : [];
  const userRows = driverIds.length ? await (await getUsersCollection()).find({ id: { $in: driverIds } }).project({ id: 1, name: 1, vehicleNumber: 1 }).toArray() : [];
  const driverLocationById = new Map(driverRows.map((driver) => [driver.userId, driver.location]));
  const driverProfileById = new Map(userRows.map((user) => [user.id, user]));
  return Response.json({ requests: items.map((item) => ({
    id: item._id,
    status: item.status,
    incidentType: item.incidentType,
    patientName: item.patientName,
    patientPhone: item.patientPhone,
    requiredEquipment: item.requiredEquipment,
    createdAt: item.createdAt,
    acceptedAt: item.acceptedAt,
    tripStage: item.tripStage,
    tripTimestamps: item.tripTimestamps,
    vitalsUpdate: item.vitalsUpdate,
    issue: item.issue,
    destination: (() => { const target = hospitalBySosId.get(item._id); return target ? { name: target.hospitalName, status: target.status, bedCategory: target.bedCategory, rejectionReason: target.rejectionReason } : null; })(),
    driverAssigned: Boolean(item.driverId),
    driver: item.driverId ? { ...(driverProfileById.get(item.driverId) ?? {}), location: driverLocationById.get(item.driverId) ?? null } : null,
  })) });
}

export async function POST(request: Request) {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });

  let body: { location?: unknown; incidentType?: unknown; requiredEquipment?: unknown };
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
    status: "searching" as const, driverId: null, dispatchRound: 0, createdAt: new Date(),
  };
  await requests.insertOne(sos);
  await advanceDispatch(sos._id);

  const hospitalRequest = await ensureHospitalRequestForSos(sos).catch(() => null);
  const hospitalRequestId = hospitalRequest?._id ?? null;

  return Response.json({
    request: { id: sos._id, status: sos.status, createdAt: sos.createdAt },
    hospitalRequestId,
    message: hospitalRequestId
      ? "SOS sent to ambulance drivers and the nearest hospital."
      : "SOS sent to available ambulance drivers; no active hospital is registered yet.",
  }, { status: 201 });
}
