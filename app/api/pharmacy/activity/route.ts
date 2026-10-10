import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  const auth = await requireRole('pharmacy');
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  try {
    const db = (await clientPromise).db();
    const profile = auth.user as typeof auth.user & { pharmacyId?: string };
    const owner = profile.pharmacyId ? null : await db.collection('pharmacies').findOne({ ownerUserId: auth.user.id }, { projection: { _id: 1 } });
    const pharmacyId = profile.pharmacyId ?? (owner?._id ? String(owner._id) : undefined);
    if (!pharmacyId) return Response.json({ error: 'Your account is not linked to a pharmacy.' }, { status: 403 });
    const entries = await db.collection('pharmacyInventoryLog').find({ pharmacyId }).sort({ createdAt: -1 }).limit(50).toArray();
    return Response.json({ logs: entries });
  } catch { return Response.json({ logs: [] }); }
}
