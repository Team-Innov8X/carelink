import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET() {
  const auth = await requireRole('pharmacy');
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  try {
    const db = (await clientPromise).db();
    const user = auth.user as typeof auth.user & { pharmacyId?: string };
    const ids: Record<string, unknown>[] = [{ _id: auth.user.id }, { id: auth.user.id }];
    if (ObjectId.isValid(auth.user.id)) ids.unshift({ _id: new ObjectId(auth.user.id) });
    const account = await db.collection('user').findOne({ $or: ids }, { projection: { pharmacyId: 1 } });
    const linkedPharmacy = await db.collection('pharmacies').findOne({ ownerUserId: auth.user.id }, { projection: { _id: 1 } });
    const pharmacyId = account?.pharmacyId ? String(account.pharmacyId) : linkedPharmacy?._id ? String(linkedPharmacy._id) : user.pharmacyId;
    if (!pharmacyId) return Response.json({ logs: [] });
    const entries = await db.collection('pharmacyInventoryLog').find({ pharmacyId }).sort({ createdAt: -1 }).limit(50).toArray();
    return Response.json({ logs: entries });
  } catch { return Response.json({ logs: [] }); }
}
