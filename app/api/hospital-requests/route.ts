import { requireRole } from "@/lib/auth-utils";
import { chooseBedCategory, chooseRequiredSpecialty, createRequestId, sosCollections, validCoordinates, workflowCollections, ensureHospitalRequestForSos } from "@/lib/sos";
import connectMongo from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole(["hospital_staff", "hospital"]);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  const query: Record<string, unknown> = { status: { $in: ["pending", "accepting", "accepted", "rejected"] } };
  if (process.env.NODE_ENV !== "development") {
    if (profile.hospitalId && profile.hospitalName) query.$or = [
      { hospitalId: profile.hospitalId },
      { hospitalName: profile.hospitalName },
    ];
    else if (profile.hospitalId) query.hospitalId = profile.hospitalId;
    else if (profile.hospitalName) query.hospitalName = profile.hospitalName;
    else return Response.json({ error: "Your account is not linked to a hospital." }, { status: 403 });
  }

  const { hospitalRequests } = await workflowCollections();
  // Older SOS requests may have been saved before the hospital inbox integration.
  // Backfill them idempotently so they appear for hospital staff as well.
  const { requests: sosRequests } = await sosCollections();
  const openSosRequests = await sosRequests.find({ status: { $in: ["searching", "accepted"] } }).limit(100).toArray();
  await Promise.all(openSosRequests.map((request) => ensureHospitalRequestForSos(request).catch(() => null)));
  const requests = await hospitalRequests.find(query).sort({ createdAt: -1 }).limit(100).toArray();
  return Response.json({ requests });
}

export async function POST(request: Request) {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  let body: { hospitalId?: unknown; hospitalName?: unknown; location?: unknown; incidentType?: unknown; requiredEquipment?: unknown };
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

  const { hospitalRequests } = await workflowCollections();
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
    bedCategory: targetHospital.inventorySource ? chooseBedCategory([incidentType, ...requiredEquipment], targetHospital.beds) : undefined,
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
  return Response.json({ request: bedRequest, message: "Bed request sent to the hospital." }, { status: 201 });
}
