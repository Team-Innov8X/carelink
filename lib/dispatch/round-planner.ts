import { SOS_MAX_ROUNDS, SOS_OFFER_BATCH_SIZE, SOS_SEARCH_RADIUS_KM, STALE_LOCATION_SECONDS } from "./constants";

export type DispatchCandidate = {
  driverId: string;
  location: { latitude: number; longitude: number };
  locationUpdatedAt?: Date;
  online: boolean;
  busy: boolean;
};

export function distanceBetweenKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/** Select a simultaneous nearest-driver offer batch after applying the server eligibility rules. */
export function selectSosOfferBatch(
  pickup: { latitude: number; longitude: number },
  candidates: readonly DispatchCandidate[],
  alreadyOfferedDriverIds: ReadonlySet<string>,
  now: Date,
): DispatchCandidate[] {
  const staleCutoff = now.getTime() - STALE_LOCATION_SECONDS * 1000;
  return candidates
    .filter((candidate) => candidate.online && !candidate.busy && !alreadyOfferedDriverIds.has(candidate.driverId))
    .filter((candidate) => candidate.locationUpdatedAt instanceof Date && candidate.locationUpdatedAt.getTime() >= staleCutoff)
    .map((candidate) => ({ candidate, distance: distanceBetweenKm(pickup, candidate.location) }))
    .filter(({ distance }) => distance <= SOS_SEARCH_RADIUS_KM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, SOS_OFFER_BATCH_SIZE)
    .map(({ candidate }) => candidate);
}

export function isDispatchExhausted(round: number, maximumRounds = SOS_MAX_ROUNDS): boolean {
  return round >= maximumRounds;
}
