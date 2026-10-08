import { requireRole } from "@/lib/auth-utils";
import { createRequestId, ensureHospitalRequestForSos, sosCollections, validCoordinates, workflowCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole(["patient", "dispatcher"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests } = await sosCollections();
  const role = (auth.user as { role?: string }).role;
  const query = role === "dispatcher" ? {} : { patientId: auth.user.id };
  const items = await requests.find(query).sort({ createdAt: -1 }).limit(50).toArray();
  const { hospitalRequests } = await workflowCollections();
  const linkedHospitalRequests = items.length ? await hospitalRequests.find({ sosRequestId: { $in: items.map((item) => item._id) } }).toArray() : [];
  const hospitalBySosId = new Map(linkedHospitalRequests.map((item) => [item.sosRequestId, item]));
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
    status: "searching" as const, driverId: null, createdAt: new Date(),
  };
  await requests.insertOne(sos);

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
