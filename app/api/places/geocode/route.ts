import { requireRole } from '@/lib/auth-utils';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await requireRole('patient');
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let body: { address?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (typeof body.address !== 'string' || body.address.trim().length < 5 || body.address.trim().length > 240) {
    return Response.json({ error: 'Enter a pickup address between 5 and 240 characters.' }, { status: 400 });
  }
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('q', body.address.trim());
    const response = await fetch(url, { headers: { 'User-Agent': 'CareLinkEmergencyAllocator/1.0 (patient pickup lookup)', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return Response.json({ error: 'Pickup address lookup is temporarily unavailable. Try GPS or check the address.' }, { status: 502 });
    const results = await response.json() as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const latitude = Number(results[0]?.lat);
    const longitude = Number(results[0]?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return Response.json({ error: 'We could not find that pickup address. Add a nearby street, city, or landmark.' }, { status: 404 });
    return Response.json({ location: { latitude, longitude }, displayName: results[0].display_name ?? body.address.trim() });
  } catch {
    return Response.json({ error: 'Pickup address lookup timed out. Try again or use GPS.' }, { status: 502 });
  }
}
