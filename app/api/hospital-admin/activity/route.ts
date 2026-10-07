import { requireRole } from '@/lib/auth-utils';
import connectMongo from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function GET() {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized || !authorization.user) {
    return Response.json({ error: authorization.reason }, { status: authorization.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const profile = authorization.user as typeof authorization.user & { hospitalId?: string; hospitalName?: string };
  const query = profile.hospitalId ? { hospitalId: profile.hospitalId } : profile.hospitalName ? { hospitalName: profile.hospitalName } : null;
  if (!query) return Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 });
  const client = await connectMongo();
  const entries = await client.db().collection('hospitalAuditLog').find(query).sort({ createdAt: -1 }).limit(100).toArray();
  return Response.json({ entries });
}
