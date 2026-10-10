import { z } from 'zod';
import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';

export const runtime = 'nodejs';
const preferencesSchema = z.object({ textSize: z.enum(['normal', 'large', 'extra-large']), highContrast: z.boolean(), notificationPreferences: z.object({ sos: z.boolean(), requestUpdates: z.boolean(), email: z.boolean(), sound: z.boolean() }) });

export async function GET() {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const value = await (await clientPromise).db().collection('userPreferences').findOne({ _id: auth.user.id as never });
  return Response.json({ preferences: value?.preferences ?? { textSize: 'normal', highContrast: false, notificationPreferences: { sos: true, requestUpdates: true, email: true, sound: true } } });
}

export async function PATCH(request: Request) {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Invalid accessibility or notification preferences.' }, { status: 400 });
  await (await clientPromise).db().collection('userPreferences').updateOne({ _id: auth.user.id as never }, { $set: { preferences: parsed.data, updatedAt: new Date() } }, { upsert: true });
  return Response.json({ success: true, preferences: parsed.data });
}
