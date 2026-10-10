import { requireRole } from "@/lib/auth-utils";
import { sosCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/sos/[id]">) {
  const auth = await requireRole(["patient", "ambulance_driver", "driver", "dispatcher"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await context.params;
  const { requests } = await sosCollections();
  const sos = await requests.findOne({ _id: id });
  if (!sos) return Response.json({ error: "SOS request not found" }, { status: 404 });
  if (sos.patientId !== auth.user.id && sos.driverId !== auth.user.id && (auth.user as { role?: string }).role !== "dispatcher") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return Response.json({ request: { id: sos._id, status: sos.status, incidentType: sos.incidentType, requiredEquipment: sos.requiredEquipment, createdAt: sos.createdAt, acceptedAt: sos.acceptedAt, driverId: sos.driverId, ...(sos.driverId === auth.user.id || sos.patientId === auth.user.id ? { patient: { name: sos.patientName, location: sos.location } } : {}) } });
}
