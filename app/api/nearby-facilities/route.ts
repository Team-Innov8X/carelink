import { requireRole } from '@/lib/auth-utils';
import { getNearbyFacilities } from '@/lib/places';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) {
    return Response.json(
      { error: auth.reason },
      { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 }
    );
  }

  const url = new URL(request.url);
  const latParam = Number(url.searchParams.get('lat') ?? url.searchParams.get('latitude'));
  const lngParam = Number(url.searchParams.get('lng') ?? url.searchParams.get('longitude'));
  const radiusParam = Number(url.searchParams.get('radius') ?? 7000);

  // Default to central Delhi if coordinates are omitted
  const lat = Number.isFinite(latParam) ? latParam : 28.6139;
  const lng = Number.isFinite(lngParam) ? lngParam : 77.209;
  const radius = Number.isFinite(radiusParam) ? Math.max(1000, Math.min(30000, radiusParam)) : 7000;

  try {
    const { registered, unregistered, all } = await getNearbyFacilities({
      lat,
      lng,
      radiusMeters: radius,
    });

    return Response.json({
      facilities: all,
      registered,
      unregistered,
      message: registered.length ? undefined : 'No nearby hospitals registered yet',
    });
  } catch (err) {
    console.error('Error fetching nearby facilities:', err);
    return Response.json({ error: 'Failed to retrieve nearby facilities.' }, { status: 500 });
  }
}
