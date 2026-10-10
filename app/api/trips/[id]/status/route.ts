import { requireRole } from "@/lib/auth-utils";
import { sosCollections } from "@/lib/sos";
import { PATCH as updateTrip } from "../../../sos/[id]/trip/route";
import { POST as cancelRequest } from "../../../sos/[id]/cancel/route";

export const runtime = "nodejs";

const stageForStatus: Record<string, string> = {
  arrived_at_patient: "arrived_patient",
  picked_up: "patient_on_board",
  en_route_to_hospital: "en_route_hospital",
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["driver", "ambulance_driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await context.params;
  let body: { status?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (body.status === "cancelled") return cancelRequest(request, { params: Promise.resolve({ id }) });
  if (body.status === "en_route_to_patient") {
    const { requests } = await sosCollections();
    const at = new Date();
    const result = await requests.updateOne({
      _id: id,
      driverId: auth.user.id,
      status: "accepted",
      dispatchStatus: "accepted",
    }, {
      $set: { dispatchStatus: "en_route_to_patient", updatedAt: at },
      $push: { transitionLog: { from: "accepted", to: "en_route_to_patient", at, actor: { type: "driver", id: auth.user.id }, reason: "Driver en route to patient" } },
    });
    return result.modifiedCount
      ? Response.json({ success: true, status: body.status, updatedAt: at })
      : Response.json({ error: "Trip status changed or this trip is not assigned to you." }, { status: 409 });
  }
  if (typeof body.status === "string" && stageForStatus[body.status]) {
    return updateTrip(new Request(request.url, { method: "PATCH", headers: request.headers, body: JSON.stringify({ stage: stageForStatus[body.status] }) }), { params: Promise.resolve({ id }) });
  }
  if (body.status === "completed") {
    const { requests } = await sosCollections();
    const current = await requests.findOne({ _id: id, driverId: auth.user.id, status: "accepted" }, { projection: { tripStage: 1 } });
    if (!current) return Response.json({ error: "Active assignment not found." }, { status: 404 });
    if (current.tripStage !== "arrived_hospital") {
      const arrival = await updateTrip(new Request(request.url, { method: "PATCH", headers: request.headers, body: JSON.stringify({ stage: "arrived_hospital" }) }), { params: Promise.resolve({ id }) });
      if (!arrival.ok) return arrival;
    }
    return updateTrip(new Request(request.url, { method: "PATCH", headers: request.headers, body: JSON.stringify({ stage: "handover_complete" }) }), { params: Promise.resolve({ id }) });
  }
  return Response.json({ error: "Unsupported trip status." }, { status: 400 });
}
