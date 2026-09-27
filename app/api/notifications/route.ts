import { requireRole } from "@/lib/auth-utils";
import { workflowCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }
  const { notifications } = await workflowCollections();
  const items = await notifications.find({ recipientId: auth.user.id }).sort({ createdAt: -1 }).limit(100).toArray();
  return Response.json({ notifications: items });
}
