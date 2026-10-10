import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';

export const runtime = 'nodejs';

const defaults = { staleThresholdMinutes: 10, weights: { resource: 50, travel: 30, freshness: 20 } };

export async function GET() {
  const auth = await requireRole();
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const settings = await (await clientPromise).db().collection<{ _id: string } & typeof defaults>('carelinkSettings').findOne({ _id: 'carelink' });
  return Response.json({ settings: settings ?? defaults });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["admin", "dispatcher"]);
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let body: typeof defaults;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const values = [body?.weights?.resource, body?.weights?.travel, body?.weights?.freshness];
  if (!Number.isInteger(body?.staleThresholdMinutes) || body.staleThresholdMinutes < 1 || body.staleThresholdMinutes > 120 || values.some((value) => !Number.isInteger(value) || value < 0) || values.reduce((sum, value) => sum + value, 0) !== 100) {
    return Response.json({ error: 'Use a freshness threshold from 1 to 120 minutes and scoring weights that add up to 100.' }, { status: 400 });
  }
  await (await clientPromise).db().collection<{ _id: string }>('carelinkSettings').updateOne({ _id: 'carelink' }, { $set: { ...body, updatedAt: new Date(), updatedBy: auth.user?.id } }, { upsert: true });
  return Response.json({ success: true, settings: body });
}
