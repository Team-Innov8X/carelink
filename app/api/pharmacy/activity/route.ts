import { requireRole } from '@/lib/auth-utils';
import connectMongo from '@/lib/mongodb';

export async function GET() {
  const auth = await requireRole('pharmacy');
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  try {
    const entries = await (await connectMongo()).db().collection('pharmacyInventoryLog').find({}).sort({ createdAt: -1 }).limit(50).toArray();
    return Response.json({ logs: entries });
  } catch { return Response.json({ logs: [] }); }
}
