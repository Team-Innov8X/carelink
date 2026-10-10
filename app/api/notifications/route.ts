import { requireRole } from "@/lib/auth-utils";
import { workflowCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }
  const { notifications } = await workflowCollections();
  const hours = Math.max(1, Number(process.env.NOTIFICATION_TTL_HOURS) || 24);
  const since = new Date(Date.now() - hours * 3600_000);
  const filter = { recipientId: auth.user.id, createdAt: { $gte: since } };
  const [items, unreadCount] = await Promise.all([
    notifications.find(filter).sort({ createdAt: -1 }).limit(100).toArray(),
    notifications.countDocuments({ ...filter, readAt: { $exists: false } }),
  ]);
  return Response.json({ notifications: items, unreadCount });
}

export async function PATCH() {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }
  const { notifications } = await workflowCollections();
  const result = await notifications.updateMany(
    { recipientId: auth.user.id, createdAt: { $gte: new Date(Date.now() - Math.max(1, Number(process.env.NOTIFICATION_TTL_HOURS) || 24) * 3600_000) }, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  );
  return Response.json({ success: true, updatedCount: result.modifiedCount });
}
