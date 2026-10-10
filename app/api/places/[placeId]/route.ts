import { requireRole } from '@/lib/auth-utils';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  const auth = await requireRole();
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const { placeId } = await params;
  if (!placeId || placeId.startsWith('osm:') || !process.env.GOOGLE_MAPS_API_KEY) return Response.json({ error: 'Phone details are unavailable for this place.' }, { status: 404 });
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'nationalPhoneNumber,internationalPhoneNumber' }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return Response.json({ error: 'Phone details are unavailable for this place.' }, { status: 502 });
    const details = await response.json() as { nationalPhoneNumber?: string; internationalPhoneNumber?: string };
    return Response.json({ phone: details.internationalPhoneNumber ?? details.nationalPhoneNumber ?? null });
  } catch { return Response.json({ error: 'Phone details are unavailable for this place.' }, { status: 502 }); }
}
