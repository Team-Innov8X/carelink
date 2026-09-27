import { requireRole } from "@/lib/auth-utils";
import { createRequestId, ensureHospitalRequestForSos, sosCollections, validCoordinates, workflowCollections } from "@/lib/sos";
import { createHash } from "node:crypto";
import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole(["patient", "dispatcher"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests } = await sosCollections();
  const role = (auth.user as { role?: string }).role;
  const query = role === "dispatcher" ? {} : { patientId: auth.user.id };
  const items = await requests.find(query).sort({ createdAt: -1 }).limit(50).toArray();
  await Promise.all(items.filter((item) => item.status === "searching" || item.status === "accepted").map((item) => ensureHospitalRequestForSos(item).catch(() => null)));
  const { hospitalRequests } = await workflowCollections();
  const linkedRequests = await hospitalRequests.find({ sosRequestId: { $in: items.map((item) => item._id) } }).toArray();
  const hospitalRequestBySos = new Map(linkedRequests.map((item) => [item.sosRequestId, item]));
  return Response.json({ requests: items.map((item) => ({
    id: item._id,
    status: item.status,
    incidentType: item.incidentType,
    patientName: item.patientName,
    patientPhone: item.patientPhone,
    requiredEquipment: item.requiredEquipment,
    createdAt: item.createdAt,
    acceptedAt: item.acceptedAt,
    driverAssigned: Boolean(item.driverId),
    hospitalRequest: (() => {
      const hospitalRequest = hospitalRequestBySos.get(item._id);
      return hospitalRequest ? {
        status: hospitalRequest.status,
        hospitalName: hospitalRequest.hospitalName,
        acceptedAt: hospitalRequest.acceptedAt,
        bedCategory: hospitalRequest.bedCategory,
        requiredSpecialty: hospitalRequest.requiredSpecialty,
      } : null;
    })(),
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

  const equipment = [...new Set(((body.requiredEquipment ?? []) as string[]).map((item) => item.trim()).filter(Boolean))].sort();
  const { requests } = await sosCollections();
  const existing = await requests.findOne({ patientId: auth.user.id, status: { $in: ["searching", "accepted"] } });
  if (existing) {
    const hospitalRequest = await ensureHospitalRequestForSos(existing).catch(() => null);
    return Response.json({
      request: { id: existing._id, status: existing.status, createdAt: existing.createdAt },
      hospitalRequestId: hospitalRequest?._id ?? null,
      hospitalRequestStatus: hospitalRequest?.status ?? null,
      message: hospitalRequest?.status === "accepted"
        ? `${hospitalRequest.hospitalName} has already accepted your request.`
        : "Your emergency request has already been created and is waiting for a hospital response.",
      existing: true,
    });
  }

  // Repeated SOS taps or request retries for the same incident resolve to the
  // same SOS during a short window, even if a driver just marked it complete.
  const incident = typeof body.incidentType === "string" ? body.incidentType.trim() : "Emergency assistance requested";
  const fingerprint = createHash("sha256").update(JSON.stringify({
    patientId: auth.user.id,
    latitude: patientLocation.latitude.toFixed(3),
    longitude: patientLocation.longitude.toFixed(3),
    incident: incident.toLowerCase(),
    equipment: equipment.map((item) => item.toLowerCase()),
  })).digest("hex");
  const windowMs = 5 * 60 * 1000;
  const now = new Date();
  const submissionKey = `${auth.user.id}:${fingerprint}`;
  const requestId = createRequestId();
  const submissionKeys = (await clientPromise).db().collection<{ _id: string; requestId: string; expiresAt: Date }>("sosSubmissionKeys");
  await submissionKeys.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  let submission;
  try {
    submission = await submissionKeys.findOneAndUpdate(
      { _id: submissionKey, $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }] },
      { $set: { requestId, expiresAt: new Date(now.getTime() + windowMs) }, $setOnInsert: { _id: submissionKey } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
    submission = await submissionKeys.findOne({ _id: submissionKey });
  }
  if (!submission || submission.requestId !== requestId) {
    let duplicate = submission ? await requests.findOne({ _id: submission.requestId }) : null;
    for (let attempt = 0; !duplicate && attempt < 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      duplicate = await requests.findOne({ _id: submission?.requestId });
    }
    if (!duplicate) return Response.json({ error: "This SOS request is already being created. Please refresh in a moment." }, { status: 409 });
    const hospitalRequest = await ensureHospitalRequestForSos(duplicate);
    return Response.json({
      request: { id: duplicate._id, status: duplicate.status, createdAt: duplicate.createdAt },
      hospitalRequestId: hospitalRequest?._id ?? null,
      message: hospitalRequest?.status === "accepted"
        ? `${hospitalRequest.hospitalName} has already accepted this request.`
        : "This incident was already submitted. Returning the existing request.",
      existing: true,
    });
  }

  const profile = auth.user as typeof auth.user & { email?: string; phone?: string };
  const sos = {
    _id: requestId, patientId: auth.user.id, patientName: auth.user.name,
    patientEmail: profile.email, patientPhone: profile.phone,
    location: patientLocation, incidentType: incidentType.trim(),
    requiredEquipment: equipment,
    status: "searching" as const, driverId: null, createdAt: new Date(),
  };
  await requests.insertOne(sos);

  const hospitalRequest = await ensureHospitalRequestForSos(sos).catch(() => null);
  const hospitalRequestId = hospitalRequest?._id ?? null;

  return Response.json({
    request: { id: sos._id, status: sos.status, createdAt: sos.createdAt },
    hospitalRequestId,
    hospitalRequestStatus: hospitalRequest?.status ?? null,
    message: hospitalRequestId
      ? "SOS sent to ambulance drivers and the nearest hospital."
      : "SOS sent to available ambulance drivers; no active hospital is registered yet.",
  }, { status: 201 });
}
