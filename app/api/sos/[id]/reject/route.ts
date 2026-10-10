import { requireRole } from '@/lib/auth-utils';
import { advanceDispatch, sosCollections } from '@/lib/sos';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ambulance_driver', 'driver']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let body: { reason?: unknown } = {};
  try { body = await request.json(); } catch { /* optional reason */ }
  const { id } = await params;
  const { requests, offers } = await sosCollections();
  const offer = await offers.findOne({ requestId: id, driverId: auth.user.id });
  const now = new Date();
  if (!offer || offer.status !== 'offered' || offer.expiresAt <= now) {
    if (offer?.status === 'offered') await offers.updateOne({ _id: offer._id, status: 'offered' }, { $set: { status: 'expired' } });
    return Response.json({ error: 'This offer has expired.' }, { status: 410 });
  }
  const result = await offers.updateOne({ _id: offer._id, status: 'offered', expiresAt: { $gt: now } }, { $set: { status: 'rejected', rejectedAt: now, reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 240) : '' } });
  if (!result.modifiedCount) return Response.json({ error: 'This offer has expired.' }, { status: 410 });
  await requests.updateOne({ _id: id, status: 'searching' }, { $addToSet: { rejectedDriverIds: auth.user.id } });
  await advanceDispatch(id);
  return Response.json({ success: true, message: 'Offer rejected. Searching the next driver group.' });
}
