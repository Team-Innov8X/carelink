function readNumber(name: string, fallback: number, minimum: number, legacyName?: string): number {
  const raw = process.env[name] ?? (legacyName ? process.env[legacyName] : undefined);
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

/** Dispatch, polling, and location thresholds live here so server and clients share one contract. */
const legacyOfferDurationMs = Number(process.env.OFFER_DURATION_MS);
const legacyOfferSeconds = Number.isFinite(legacyOfferDurationMs) && legacyOfferDurationMs >= 1000
  ? legacyOfferDurationMs / 1000
  : undefined;
export const SOS_OFFER_SECONDS = readNumber("SOS_OFFER_SECONDS", legacyOfferSeconds ?? 10, 1, "OFFER_DURATION_SECONDS");
export const SOS_OFFER_BATCH_SIZE = readNumber("SOS_OFFER_BATCH_SIZE", 3, 1, "DISPATCH_BATCH_SIZE");
export const SOS_MAX_ROUNDS = readNumber("SOS_MAX_ROUNDS", 3, 1, "DISPATCH_MAX_ROUNDS");
export const SOS_SEARCH_RADIUS_KM = readNumber("SOS_SEARCH_RADIUS_KM", 10, 1, "DISPATCH_RADIUS_KM");
export const NORMAL_REQUEST_EXPIRY_MIN = readNumber("NORMAL_REQUEST_EXPIRY_MIN", 15, 1);
export const POLL_SECONDS = readNumber("POLL_SECONDS", 3, 1);
export const LOCATION_PING_SECONDS = readNumber("LOCATION_PING_SECONDS", 5, 1);
export const STALE_LOCATION_SECONDS = readNumber("STALE_LOCATION_SECONDS", 30, 1);
export const ROUTE_REFRESH_SECONDS = readNumber("ROUTE_REFRESH_SECONDS", 30, 1);
export const ROUTE_DEVIATION_M = readNumber("ROUTE_DEVIATION_M", 200, 1);
export const LOCATION_RETENTION_DAYS = readNumber("LOCATION_RETENTION_DAYS", 30, 1);
export const EMERGENCY_FALLBACK_TEXT = process.env.EMERGENCY_FALLBACK_TEXT?.trim()
  || "If no driver is found, contact your local emergency services immediately.";

export const SOS_OFFER_DURATION_MS = SOS_OFFER_SECONDS * 1000;
