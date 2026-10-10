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
  if (!offer || !['offered', 'pending'].includes(offer.status) || offer.expiresAt <= now) {
    if (offer && ['offered', 'pending'].includes(offer.status)) await offers.updateOne({ _id: offer._id, status: offer.status }, {
      $set: { status: 'expired', respondedAt: now },
      $push: { transitionLog: { from: offer.status, to: 'expired', at: now, actor: { type: 'system', id: 'dispatch' }, reason: 'Offer expired before decline' } },
    });
    return Response.json({ error: 'This offer has expired.' }, { status: 410 });
  }
  const result = await offers.updateOne({ _id: offer._id, status: offer.status, expiresAt: { $gt: now } }, {
    $set: { status: 'declined', respondedAt: now, rejectedAt: now, reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 240) : '' },
    $push: { transitionLog: { from: offer.status, to: 'declined', at: now, actor: { type: 'driver', id: auth.user.id }, reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 240) : 'Declined by driver' } },
  });
  if (!result.modifiedCount) return Response.json({ error: 'This offer has expired.' }, { status: 410 });
  const sos = await requests.findOne({ _id: id, status: 'searching' });
  await requests.updateOne({ _id: id, status: 'searching' }, { $addToSet: { rejectedDriverIds: auth.user.id } });
  if (sos?.type !== 'normal') await advanceDispatch(id);
  return Response.json({ success: true, message: 'Offer rejected. Searching the next driver group.' });
}
