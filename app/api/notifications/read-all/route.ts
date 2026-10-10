import { requireRole } from '@/lib/auth-utils';
import { workflowCollections } from '@/lib/sos';

export const runtime = 'nodejs';

export async function PATCH() {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const { notifications } = await workflowCollections();
  const ttlHours = Math.max(1, Number(process.env.NOTIFICATION_TTL_HOURS) || 24);
  const result = await notifications.updateMany(
    { recipientId: auth.user.id, createdAt: { $gte: new Date(Date.now() - ttlHours * 3_600_000) }, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  );
  return Response.json({ success: true, updatedCount: result.modifiedCount });
}
