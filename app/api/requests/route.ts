import { requireRole } from "@/lib/auth-utils";
import {
  createRequestId,
  distanceKm,
  sosCollections,
  validCoordinates,
} from "@/lib/sos";
import {
  NORMAL_REQUEST_EXPIRY_MIN,
  SOS_SEARCH_RADIUS_KM,
  STALE_LOCATION_SECONDS,
} from "@/lib/dispatch/constants";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 160) {
    return Response.json({ error: "An Idempotency-Key header is required (maximum 160 characters)." }, { status: 400 });
  }
  let body: { location?: unknown; destination?: unknown; urgency?: unknown; notes?: unknown; preferredTime?: unknown; requiredEquipment?: unknown; patientPhone?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const pickup = body.location;
  if (!validCoordinates(pickup)) return Response.json({ error: "location must include valid latitude and longitude" }, { status: 400 });
  if (typeof body.destination !== "string" || body.destination.trim().length < 2 || body.destination.length > 240) {
    return Response.json({ error: "destination must be between 2 and 240 characters" }, { status: 400 });
  }
  if (body.urgency !== undefined && (typeof body.urgency !== "string" || body.urgency.length > 40)) {
    return Response.json({ error: "urgency must be a string of at most 40 characters" }, { status: 400 });
  }
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 1000)) {
    return Response.json({ error: "notes must be a string of at most 1000 characters" }, { status: 400 });
  }
  if (typeof body.patientPhone !== "string" || body.patientPhone.trim().length < 6 || body.patientPhone.trim().length > 30) {
    return Response.json({ error: "patientPhone must be between 6 and 30 characters" }, { status: 400 });
  }

  const { requests, drivers, offers } = await sosCollections();
  const existing = await requests.findOne({ patientId: auth.user.id, idempotencyKey });
  if (existing) return Response.json({ request: { id: existing._id, status: existing.status, createdAt: existing.createdAt }, existing: true });

  const now = new Date();
  const id = createRequestId();
  const expiresAt = new Date(now.getTime() + NORMAL_REQUEST_EXPIRY_MIN * 60_000);
  const profile = auth.user as typeof auth.user & { phone?: string };
  const item = {
    _id: id,
    patientId: auth.user.id,
    patientName: auth.user.name,
    patientPhone: body.patientPhone.trim() || profile.phone,
    location: pickup,
    destination: { name: body.destination.trim() },
    incidentType: "Routine medical transport",
    requiredEquipment: Array.isArray(body.requiredEquipment)
      ? body.requiredEquipment.filter((value): value is string => typeof value === "string").slice(0, 12)
      : [],
    type: "normal" as const,
    requestType: "routine" as const,
    urgency: typeof body.urgency === "string" ? body.urgency.trim() : "standard",
    notes: typeof body.notes === "string" ? body.notes.trim() : "",
    preferredTime: typeof body.preferredTime === "string" ? body.preferredTime.slice(0, 100) : "Immediate",
    idempotencyKey,
    expiresAt,
    status: "searching" as const,
    dispatchStatus: "offered" as const,
    driverId: null,
    dispatchRound: 1,
    createdAt: now,
    transitionLog: [
      { from: null, to: "created", at: now, actor: { type: "patient", id: auth.user.id }, reason: "Normal request created" },
      { from: "created", to: "offered", at: now, actor: { type: "system", id: "dispatch" }, reason: "Normal request published to eligible drivers" },
    ],
  };
  try {
    await requests.insertOne(item);
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const winner = await requests.findOne({ patientId: auth.user.id, idempotencyKey });
    if (winner) return Response.json({ request: { id: winner._id, status: winner.status, createdAt: winner.createdAt }, existing: true });
    throw error;
  }

  const staleBefore = new Date(now.getTime() - STALE_LOCATION_SECONDS * 1000);
  const candidates = await drivers.find({
    available: true,
    activeRequestId: { $exists: false },
    location: { $exists: true },
    locationUpdatedAt: { $gte: staleBefore },
  }).toArray();
  const eligible = candidates
    .filter((driver) => validCoordinates(driver.location) && distanceKm(pickup, driver.location) <= SOS_SEARCH_RADIUS_KM)
    .sort((a, b) => distanceKm(pickup, a.location!) - distanceKm(pickup, b.location!));
  if (eligible.length) {
    await offers.insertMany(eligible.map((driver) => ({
      _id: `${id}:1:${driver.userId}`,
      requestId: id,
      driverId: driver.userId,
      round: 1,
      createdAt: now,
      expiresAt,
      status: "pending" as const,
      transitionLog: [{ from: null, to: "pending", at: now, actor: { type: "system", id: "dispatch" }, reason: "Normal request offered to driver" }],
    })), { ordered: false });
  }
  return Response.json({ request: { id, status: "searching", createdAt: now, expiresAt }, message: "Your transport request was shared with available drivers." }, { status: 201 });
}
