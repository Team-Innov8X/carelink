import { requireRole } from "@/lib/auth-utils";
import { workflowCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function PATCH(_request: Request, context: RouteContext<"/api/notifications/[id]">) {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }
  const { id } = await context.params;
  const { notifications } = await workflowCollections();
  const result = await notifications.updateOne(
    { _id: id, recipientId: auth.user.id },
    { $set: { readAt: new Date() } },
  );
  if (result.matchedCount !== 1) return Response.json({ error: "Notification not found." }, { status: 404 });
  return Response.json({ success: true });
}
