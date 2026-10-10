import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function GET() {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized || !authorization.user) {
    return Response.json({ error: authorization.reason }, { status: authorization.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  try {
  const profile = authorization.user as typeof authorization.user & { hospitalId?: string; hospitalName?: string };
  const scope: Record<string, string>[] = [];
  if (profile.hospitalId) scope.push({ hospitalId: profile.hospitalId });
  if (profile.hospitalName) scope.push({ hospitalName: profile.hospitalName });
  if (!scope.length) return Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 });
  const client = await clientPromise;
  const entries = await client.db().collection('hospitalAuditLog').find({ $or: scope }).sort({ createdAt: -1 }).limit(100).toArray();
  return Response.json({ entries });
  } catch (error) {
    console.error('Could not load hospital activity:', error);
    return Response.json({ error: 'Could not load hospital activity. Please refresh and try again.' }, { status: 500 });
  }
}
