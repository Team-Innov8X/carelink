import { requireRole } from "@/lib/auth-utils";
import { sosCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/sos/[id]/arrive">) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { id } = await context.params;
  const { requests } = await sosCollections();
  const sos = await requests.findOne({ _id: id, driverId: auth.user.id, status: "accepted" });
  if (!sos) return Response.json({ error: "Accepted SOS request not found for this driver" }, { status: 404 });

  const arrivedAt = sos.arrivedAt ?? new Date();
  await requests.updateOne(
    { _id: id, driverId: auth.user.id, status: "accepted" },
    { $set: { arrivedAt } },
  );

  return Response.json({ request: { id, arrivedAt }, message: "Arrival recorded. Finding the nearest suitable hospital." });
}
