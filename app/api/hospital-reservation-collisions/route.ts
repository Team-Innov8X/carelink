import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireRole();
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const entries = await (await clientPromise).db().collection('hospitalReservationCollisions').find({}).sort({ occurredAt: -1 }).limit(100).toArray();
  return Response.json({ entries });
}
