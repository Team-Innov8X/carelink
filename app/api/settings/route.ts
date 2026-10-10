import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';

export const runtime = 'nodejs';

const defaults = { staleThresholdMinutes: 10, weights: { resource: 45, travel: 25, freshness: 20, availability: 10 } };

function upgradeWeights(weights?: Partial<typeof defaults.weights>) {
  if (!weights) return defaults.weights;
  if (typeof weights.availability === 'number') return { ...defaults.weights, ...weights };
  const values = [weights.resource, weights.travel, weights.freshness];
  const total = values.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
  if (total <= 0) return defaults.weights;
  const resource = Math.round((weights.resource ?? 0) / total * 90);
  const travel = Math.round((weights.travel ?? 0) / total * 90);
  return {
    resource,
    travel,
    freshness: 90 - resource - travel,
    availability: 10,
  };
}

export async function GET() {
  const auth = await requireRole();
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const settings = await (await clientPromise).db().collection<{ _id: string } & typeof defaults>('carelinkSettings').findOne({ _id: 'carelink' });
  return Response.json({ settings: { ...defaults, ...settings, weights: upgradeWeights(settings?.weights) } });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["admin", "dispatcher"]);
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (typeof body !== 'object' || body === null) return Response.json({ error: 'Settings must be an object.' }, { status: 400 });
  const candidate = body as Partial<typeof defaults>;
  const rawWeights = candidate.weights as Partial<typeof defaults.weights> | undefined;
  const legacyWeights = [rawWeights?.resource, rawWeights?.travel, rawWeights?.freshness];
  const legacyShapeValid = legacyWeights.every((value) => Number.isInteger(value) && value! >= 0)
    && (rawWeights?.availability === undefined || (Number.isInteger(rawWeights.availability) && rawWeights.availability >= 0));
  const legacyTotalValid = rawWeights?.availability !== undefined || legacyWeights.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0) === 100;
  if (!legacyShapeValid || !legacyTotalValid) return Response.json({ error: 'Provide non-negative integer scoring weights that add up to 100.' }, { status: 400 });
  const weights = upgradeWeights(candidate.weights);
  const values = [weights.resource, weights.travel, weights.freshness, weights.availability];
  if (!Number.isInteger(candidate.staleThresholdMinutes) || candidate.staleThresholdMinutes! < 1 || candidate.staleThresholdMinutes! > 120 || values.some((value) => !Number.isInteger(value) || value < 0) || values.reduce((sum, value) => sum + value, 0) !== 100) {
    return Response.json({ error: 'Use a freshness threshold from 1 to 120 minutes and scoring weights that add up to 100.' }, { status: 400 });
  }
  const settings = { staleThresholdMinutes: candidate.staleThresholdMinutes!, weights };
  await (await clientPromise).db().collection<{ _id: string }>('carelinkSettings').updateOne({ _id: 'carelink' }, { $set: { ...settings, updatedAt: new Date(), updatedBy: auth.user?.id } }, { upsert: true });
  return Response.json({ success: true, settings });
}
