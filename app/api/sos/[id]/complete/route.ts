import { requireRole } from "@/lib/auth-utils";
import { sosCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/sos/[id]/complete">) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await context.params;
  const { requests, drivers } = await sosCollections();
  const current = await requests.findOne({ _id: id, driverId: auth.user.id, status: "accepted" }, { projection: { dispatchStatus: 1 } });
  if (!current) return Response.json({ error: "Active SOS request not found for this driver" }, { status: 404 });
  const completedAt = new Date();
  const previous = current.dispatchStatus ?? "accepted";
  const result = await requests.updateOne(
    { _id: id, driverId: auth.user.id, status: "accepted" },
    {
      $set: { status: "completed", dispatchStatus: "completed", completedAt },
      $unset: { activePatientId: "" },
      $push: { transitionLog: { from: previous, to: "completed", at: completedAt, actor: { type: "driver", id: auth.user.id }, reason: "Trip completed" } },
    },
  );
  if (result.modifiedCount !== 1) return Response.json({ error: "Active SOS request not found for this driver" }, { status: 404 });
  await drivers.updateOne(
    { userId: auth.user.id, activeRequestId: id },
    { $set: { available: true, updatedAt: new Date() }, $unset: { activeRequestId: "" } },
  );
  return Response.json({ request: { id, status: "completed" }, available: true });
}
