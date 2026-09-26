import { requireRole } from "@/lib/auth-utils";
import { createRequestId, sosCollections, validCoordinates } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole(["patient", "dispatcher"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests } = await sosCollections();
  const role = (auth.user as { role?: string }).role;
  const query = role === "dispatcher" ? {} : { patientId: auth.user.id };
  const items = await requests.find(query).sort({ createdAt: -1 }).limit(50).toArray();
  return Response.json({ requests: items.map((item) => ({
    id: item._id,
    status: item.status,
    incidentType: item.incidentType,
    requiredEquipment: item.requiredEquipment,
    createdAt: item.createdAt,
    acceptedAt: item.acceptedAt,
    driverAssigned: Boolean(item.driverId),
  })) });
}

export async function POST(request: Request) {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });

  let body: { location?: unknown; incidentType?: unknown; requiredEquipment?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!validCoordinates(body.location)) return Response.json({ error: "location must include valid latitude and longitude" }, { status: 400 });
  if (typeof body.incidentType !== "string" || body.incidentType.trim().length < 2 || body.incidentType.length > 120) {
    return Response.json({ error: "incidentType must be between 2 and 120 characters" }, { status: 400 });
  }
  if (body.requiredEquipment !== undefined && (!Array.isArray(body.requiredEquipment) || body.requiredEquipment.some((item) => typeof item !== "string" || item.length > 80))) {
    return Response.json({ error: "requiredEquipment must be an array of strings" }, { status: 400 });
  }

  const { requests } = await sosCollections();
  const sos = {
    _id: createRequestId(), patientId: auth.user.id, patientName: auth.user.name,
    location: body.location, incidentType: body.incidentType.trim(),
    requiredEquipment: [...new Set(((body.requiredEquipment ?? []) as string[]).map((item) => item.trim()).filter(Boolean))],
    status: "searching" as const, driverId: null, createdAt: new Date(),
  };
  await requests.insertOne(sos);
  return Response.json({ request: { id: sos._id, status: sos.status, createdAt: sos.createdAt }, message: "SOS sent to available ambulance drivers" }, { status: 201 });
}
