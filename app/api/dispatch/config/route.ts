import { LOCATION_CHANGE_THRESHOLD_M, LOCATION_PING_SECONDS, MAX_ROUTE_ACCURACY_M, ROUTE_DEVIATION_M, ROUTE_REFRESH_SECONDS, STALE_LOCATION_SECONDS } from '@/lib/dispatch/constants';

export const runtime = 'nodejs';

/** Non-secret workflow thresholds used by map and GPS clients. */
export async function GET() {
  return Response.json({
    locationPingSeconds: LOCATION_PING_SECONDS,
    locationChangeThresholdM: LOCATION_CHANGE_THRESHOLD_M,
    staleLocationSeconds: STALE_LOCATION_SECONDS,
    routeRefreshSeconds: ROUTE_REFRESH_SECONDS,
    routeDeviationM: ROUTE_DEVIATION_M,
    maxRouteAccuracyM: MAX_ROUTE_ACCURACY_M,
  }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
