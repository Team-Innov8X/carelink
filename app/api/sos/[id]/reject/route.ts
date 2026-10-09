import { requireRole } from '@/lib/auth-utils';
import { sosCollections } from '@/lib/sos';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ambulance_driver', 'driver']);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  let body: { reason?: unknown } = {};
  try { body = await request.json(); } catch { /* a reason is optional */ }
  const { id } = await params;
  const { requests, drivers } = await sosCollections();
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 240) : '';
  const result = await requests.updateOne(
    { _id: id, status: 'searching', rejectedDriverIds: { $ne: auth.user.id }, $or: [{ assignedDriverId: auth.user.id }, { assignedDriverId: { $exists: false } }] },
    { $addToSet: { rejectedDriverIds: auth.user.id }, $push: { driverResponses: { driverId: auth.user.id, reason: reason || undefined, rejectedAt: new Date() } }, $unset: { assignedDriverId: '', assignmentExpiresAt: '' } },
  );
  if (!result.matchedCount) return Response.json({ error: 'This SOS request is no longer available.' }, { status: 409 });
  await drivers.updateOne({ userId: auth.user.id, pendingOfferRequestId: id }, { $unset: { pendingOfferRequestId: '', pendingOfferExpiresAt: '' }, $set: { updatedAt: new Date() } });
  return Response.json({ success: true, message: 'Request passed on. It remains available to other drivers.' });
}
