import { requireRole } from "@/lib/auth-utils";
import { sosCollections } from "@/lib/sos";
import { getUsersCollection } from "@/lib/models/db";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests, drivers } = await sosCollections();
  const item = await requests.findOne({
    patientId: auth.user.id,
    status: { $in: ["searching", "accepted"] },
  }, { sort: { createdAt: -1 } });
  if (!item) return Response.json({ request: null });
  const accepted = item.status === "accepted" && Boolean(item.driverId);
  const assignedDriverId = accepted ? item.driverId : undefined;
  const driver = assignedDriverId
    ? await drivers.findOne({ userId: assignedDriverId }, { projection: { userId: 1, location: 1, locationUpdatedAt: 1, vehicleNumber: 1, ambulanceId: 1 } })
    : null;
  const profile = assignedDriverId ? await (await getUsersCollection()).findOne({ id: assignedDriverId }, { projection: { id: 1, name: 1, phone: 1 } }) : null;
  return Response.json({ request: {
    id: item._id,
    type: item.type ?? (item.requestType === "routine" ? "normal" : "sos"),
    status: item.status,
    incidentType: item.incidentType,
    location: item.location,
    destination: item.destination ?? null,
    urgency: item.urgency ?? null,
    notes: item.notes ?? null,
    createdAt: item.createdAt,
    acceptedAt: accepted ? item.acceptedAt : null,
    tripStage: accepted ? item.tripStage ?? "accepted" : null,
    driver: accepted ? {
      id: item.driverId,
      name: profile?.name ?? null,
      phone: profile?.phone ?? null,
      vehicleNumber: driver?.vehicleNumber ?? driver?.ambulanceId ?? null,
      location: driver?.location ?? null,
      locationUpdatedAt: driver?.locationUpdatedAt ?? null,
    } : null,
  } });
}
