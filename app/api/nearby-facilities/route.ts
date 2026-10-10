import { requireRole } from '@/lib/auth-utils';
import { getNearbyFacilities } from '@/lib/places';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) {
    return Response.json(
      { error: auth.reason },
      { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 }
    );
  }

  const url = new URL(request.url);
  const latRaw = url.searchParams.get('lat') ?? url.searchParams.get('latitude');
  const lngRaw = url.searchParams.get('lng') ?? url.searchParams.get('longitude');
  if (latRaw === null || lngRaw === null) return Response.json({ error: 'Location is required to search nearby facilities.' }, { status: 400 });
  const latParam = Number(latRaw);
  const lngParam = Number(lngRaw);
  const radiusParam = Number(url.searchParams.get('radius') ?? 7000);

  if (!Number.isFinite(latParam) || latParam < -90 || latParam > 90 || !Number.isFinite(lngParam) || lngParam < -180 || lngParam > 180) return Response.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 });
  const lat = latParam;
  const lng = lngParam;
  const radius = Number.isFinite(radiusParam) ? Math.max(1000, Math.min(30000, radiusParam)) : 7000;

  try {
    const { registered, unregistered, all } = await getNearbyFacilities({
      lat,
      lng,
      radiusMeters: radius,
    });
    if (process.env.CARELINK_PERF_LOGS === "1") console.info(JSON.stringify({ event: "carelink.perf", name: "nearby_facilities_get", durationMs: Math.round((performance.now() - startedAt) * 100) / 100, resultCount: all.length }));

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
