import { getHospitalsCollection, getDb, initializeIndexes } from './models/db.ts';
import { distanceKm } from './sos.ts';
import { ObjectId } from 'mongodb';

export interface NearbyFacility {
  id: string;
  placeId?: string;
  name: string;
  type: 'hospital' | 'pharmacy';
  location: {
    lat: number;
    lng: number;
    address?: string | null;
  };
  distanceKm: number;
  travelTimeMinutes?: number;
  registered: boolean;
  label: string;
  // ONLY populated when registered === true:
  beds?: {
    total: number;
    available: number;
  };
  doctors?: {
    count: number;
  };
  status?: string;
  isDemo?: boolean;
  specialties?: string[];
  phone?: string;
}

export interface GooglePlaceResult {
  place_id: string;
  name: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  vicinity?: string;
  types?: string[];
}

interface CacheEntry {
  timestamp: number;
  results: GooglePlaceResult[];
}

// In-memory rounded-cell cache to keep public Overpass traffic modest.
const placesCache = new Map<string, CacheEntry>();
const failedLookupCache = new Map<string, number>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAILURE_BACKOFF_MS = 60 * 1000;

/**
 * Computes a coarse spatial cell key by rounding coordinates to 2 decimal places (~1.1 km).
 */
export function getCellKey(lat: number, lng: number, type: string): string {
  const cellLat = Math.round(lat * 100) / 100;
  const cellLng = Math.round(lng * 100) / 100;
  return `${cellLat.toFixed(2)}_${cellLng.toFixed(2)}_${type}`;
}

/**
 * Clears the places cache (useful for testing).
 */
export function clearPlacesCache(): void {
  placesCache.clear();
  failedLookupCache.clear();
}

/**
 * Fetches Google Places Nearby Search results when configured, with OSM fallback.
 * Checks the 10-minute rounded-location cache first.
 */
export async function fetchPlacesNearby(
  lat: number,
  lng: number,
  type: 'hospital' | 'pharmacy',
  radiusMeters = 5000,
): Promise<GooglePlaceResult[]> {
  const cellKey = getCellKey(lat, lng, `${type}_${Math.ceil(radiusMeters / 1000)}`);
  const cached = placesCache.get(cellKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }
  if ((failedLookupCache.get(cellKey) ?? 0) > now) return [];

  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      const startedAt = performance.now();
      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.formattedAddress,places.types' },
        body: JSON.stringify({ includedTypes: [type], maxResultCount: 20, locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } } }),
        signal: AbortSignal.timeout(8000),
      });
      if (process.env.CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'google_places_nearby', type, durationMs: Math.round((performance.now() - startedAt) * 100) / 100, status: response.status }));
      if (response.ok) {
        const data = await response.json() as { places?: Array<{ id: string; displayName?: { text?: string }; location?: { latitude?: number; longitude?: number }; formattedAddress?: string; types?: string[] }> };
        const results = (data.places ?? []).flatMap((place) => place.id && place.displayName?.text && typeof place.location?.latitude === 'number' && typeof place.location.longitude === 'number' ? [{ place_id: place.id, name: place.displayName.text, geometry: { location: { lat: place.location.latitude, lng: place.location.longitude } }, vicinity: place.formattedAddress, types: place.types ?? [type] }] : []);
        placesCache.set(cellKey, { timestamp: now, results });
        return results;
      }
      console.warn(`Google Places Nearby Search returned HTTP ${response.status}`);
    }
    const tag = type === 'hospital' ? 'hospital' : 'pharmacy';
    const query = `[out:json][timeout:8];(node[amenity=${tag}](around:${radiusMeters},${lat},${lng});way[amenity=${tag}](around:${radiusMeters},${lat},${lng});relation[amenity=${tag}](around:${radiusMeters},${lat},${lng}););out center tags;`;
    const externalStartedAt = performance.now();
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'CareLinkEmergencyAllocator/1.0 (nearby facility lookup)' }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(10_000) });
    if (process.env.CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'overpass_facilities', type, durationMs: Math.round((performance.now() - externalStartedAt) * 100) / 100, status: res.status }));
    if (!res.ok) {
      failedLookupCache.set(cellKey, now + FAILURE_BACKOFF_MS);
      if (res.status !== 429 && res.status !== 504) console.warn(`OpenStreetMap Overpass returned HTTP ${res.status}`);
      return [];
    }
    const data = await res.json() as { elements?: Array<{ id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> };
    const results: GooglePlaceResult[] = (data.elements ?? []).flatMap((element) => {
      const point = element.center ?? (element.lat !== undefined && element.lon !== undefined ? { lat: element.lat, lon: element.lon } : null);
      const name = element.tags?.name;
      if (!point || !name) return [];
      return [{ place_id: `osm:${element.type}:${element.id}`, name, geometry: { location: { lat: point.lat, lng: point.lon } }, vicinity: element.tags?.['addr:full'] || element.tags?.['addr:street'], types: [tag] }];
    });
    placesCache.set(cellKey, { timestamp: now, results });
    return results;
  } catch (error) {
    failedLookupCache.set(cellKey, now + FAILURE_BACKOFF_MS);
    if (!(error instanceof Error && error.name === 'AbortError')) {
      console.warn('OpenStreetMap search request failed:', error instanceof Error ? error.message : error);
    }
    return [];
  }
}

/**
 * Merges OpenStreetMap results with MongoDB hospitals and pharmacies.
 * Ensures:
 * 1. Registered facilities are matched with Places by placeId (or coordinate/name proximity) so nothing is duplicated.
 * 2. Registered facilities show green marker, "Live data" label, bed counts, and doctors from DB.
 * 3. Unregistered facilities show grey marker, label "Not registered — availability unknown, call to confirm".
 * 4. NEVER show bed counts, doctors, or "available" for unregistered facilities.
 */
export async function getNearbyFacilities({
  lat,
  lng,
  radiusMeters = 7000,
}: {
  lat: number;
  lng: number;
  radiusMeters?: number;
}): Promise<{
  registered: NearbyFacility[];
  unregistered: NearbyFacility[];
  all: NearbyFacility[];
}> {
  await initializeIndexes();
  // Overpass and the registered hospital query are independent; start them together.
  const hospitalsQueryPromise = (async () => {
    const [db, hospitalsCol] = await Promise.all([getDb(), getHospitalsCollection()]);
    const hospitalsQueryStartedAt = performance.now();
    const dbHospitals = await hospitalsCol.find(
      { status: { $ne: 'inactive' }, location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: radiusMeters } } },
      { projection: { _id: 1, name: 1, location: 1, status: 1, address: 1, placeId: 1, isDemo: 1, capacitySummary: 1, specialties: 1, contact: 1 } },
    ).toArray();
    if (process.env.CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'nearby_hospitals_query', durationMs: Math.round((performance.now() - hospitalsQueryStartedAt) * 100) / 100, resultCount: dbHospitals.length }));
    return { db, dbHospitals };
  })();
  const [[placesHospitals, placesPharmacies], { db, dbHospitals }] = await Promise.all([
    Promise.all([fetchPlacesNearby(lat, lng, 'hospital', radiusMeters), fetchPlacesNearby(lat, lng, 'pharmacy', radiusMeters)]),
    hospitalsQueryPromise,
  ]);
  const allPlaces = [...placesHospitals, ...placesPharmacies];

  const doctorsCol = db.collection('doctors');
  const resourcesCol = db.collection('resources');

  const registeredFacilities: NearbyFacility[] = [];
  const matchedPlaceIds = new Set<string>();

  const nearbyHospitals = dbHospitals.flatMap((hospital) => {
    const location = hospital.location as unknown as { latitude?: number; longitude?: number; coordinates?: [number, number] };
    const hospLat = typeof location?.latitude === 'number' ? location.latitude : location?.coordinates?.[1];
    const hospLng = typeof location?.longitude === 'number' ? location.longitude : location?.coordinates?.[0];
    if (typeof hospLat !== 'number' || typeof hospLng !== 'number') return [];
    const distance = distanceKm({ latitude: lat, longitude: lng }, { latitude: hospLat, longitude: hospLng });
    if (distance * 1000 > radiusMeters) return [];
    return [{ hospital, hospLat, hospLng, distance, hospitalId: String(hospital._id ?? hospital.id) }];
  });
  const hospitalIds = nearbyHospitals.map(({ hospitalId }) => hospitalId);
  const capacityQueryStartedAt = performance.now();
  const [bedResources, doctorCounts] = hospitalIds.length ? await Promise.all([
    resourcesCol.find({ hospitalId: { $in: hospitalIds }, type: 'bed' }, { projection: { hospitalId: 1, totalQuantity: 1, availableQuantity: 1, heldQuantity: 1 } }).toArray(),
    doctorsCol.aggregate<{ _id: string; count: number }>([
      { $match: { hospitalId: { $in: hospitalIds } } },
      { $group: { _id: '$hospitalId', count: { $sum: 1 } } },
    ]).toArray(),
  ]) : [[], []];
  const bedResourceByHospital = new Map(bedResources.map((resource) => [resource.hospitalId, resource]));
  const doctorsByHospital = new Map(doctorCounts.map(({ _id, count }) => [_id, count]));
  if (process.env.CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'nearby_capacity_and_doctor_queries', durationMs: Math.round((performance.now() - capacityQueryStartedAt) * 100) / 100, hospitalCount: hospitalIds.length }));

  for (const { hospital: hosp, hospLat, hospLng, distance: dist, hospitalId: hospId } of nearbyHospitals) {
    const bedResource = bedResourceByHospital.get(hospId);
    const totalBeds = bedResource?.totalQuantity ?? hosp.capacitySummary?.totalBeds ?? 0;
    const availableBeds = bedResource
      ? Math.max(0, bedResource.availableQuantity - (bedResource.heldQuantity ?? 0))
      : hosp.capacitySummary?.availableBeds ?? 0;

    // Get doctors count
    const doctorCount = doctorsByHospital.get(hospId) ?? 0;

    // Address
    const addressStr = typeof hosp.address === 'string'
      ? hosp.address
      : hosp.address
        ? [hosp.address.street, hosp.address.city].filter(Boolean).join(', ')
        : null;

    // Match with Google Places if placeId matches or coordinates are within 100m
    let matchedPlace = allPlaces.find((p) => hosp.placeId && p.place_id === hosp.placeId);
    if (!matchedPlace) {
      matchedPlace = allPlaces.find((p) => {
        const d = distanceKm(
          { latitude: hospLat!, longitude: hospLng! },
          { latitude: p.geometry.location.lat, longitude: p.geometry.location.lng },
        );
        return d < 0.15; // within 150 meters
      });
    }

    if (matchedPlace) {
      matchedPlaceIds.add(matchedPlace.place_id);
    }

    const isDemo = Boolean((hosp as typeof hosp & { isDemo?: boolean }).isDemo);
    registeredFacilities.push({
      id: hospId,
      placeId: hosp.placeId ?? matchedPlace?.place_id,
      name: hosp.name,
      type: 'hospital',
      location: {
        lat: hospLat,
        lng: hospLng,
        address: addressStr,
      },
      distanceKm: Number(dist.toFixed(1)),
      registered: !isDemo,
      isDemo,
      label: isDemo ? 'Demo' : 'Registered',
      specialties: Array.isArray(hosp.specialties) ? hosp.specialties.filter((value): value is string => typeof value === 'string') : [],
      ...(!isDemo && hosp.contact?.phone ? { phone: hosp.contact.phone } : {}),
      ...(!isDemo ? { beds: {
        total: totalBeds,
        available: availableBeds,
      },
      doctors: {
        count: doctorCount,
      } } : {}),
      status: hosp.status || 'active',
    });
  }

  const pharmacyQueryStartedAt = performance.now();
  const dbPharmacies = await db.collection<{ _id?: ObjectId; ownerUserId?: string; name: string; location?: { coordinates?: [number, number] }; address?: { street?: string; city?: string }; contact?: { phone?: string }; isDemo?: boolean; placeId?: string }>('pharmacies').find(
    { location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: radiusMeters } } },
    { projection: { _id: 1, ownerUserId: 1, name: 1, location: 1, address: 1, contact: 1, isDemo: 1, placeId: 1 } },
  ).toArray();
  if (process.env.CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'nearby_pharmacies_query', durationMs: Math.round((performance.now() - pharmacyQueryStartedAt) * 100) / 100, resultCount: dbPharmacies.length }));
  for (const pharmacy of dbPharmacies) {
    const [pharmacyLng, pharmacyLat] = pharmacy.location?.coordinates ?? [];
    if (typeof pharmacyLat !== 'number' || typeof pharmacyLng !== 'number') continue;
    const distance = distanceKm({ latitude: lat, longitude: lng }, { latitude: pharmacyLat, longitude: pharmacyLng });
    if (distance * 1000 > radiusMeters) continue;
    const pharmacyId = String(pharmacy._id ?? pharmacy.ownerUserId ?? pharmacy.name);
    registeredFacilities.push({ id: pharmacyId, placeId: pharmacy.placeId, name: pharmacy.name, type: 'pharmacy', location: { lat: pharmacyLat, lng: pharmacyLng, address: [pharmacy.address?.street, pharmacy.address?.city].filter(Boolean).join(', ') || null }, distanceKm: Number(distance.toFixed(1)), registered: !pharmacy.isDemo, isDemo: Boolean(pharmacy.isDemo), label: pharmacy.isDemo ? 'Demo' : 'Live data', ...(!pharmacy.isDemo && pharmacy.contact?.phone ? { phone: pharmacy.contact.phone } : {}) });
  }

  // 3. Process unregistered facilities from Google Places
  const unregisteredFacilities: NearbyFacility[] = [];

  for (const place of allPlaces) {
    if (matchedPlaceIds.has(place.place_id)) continue;

    const pLat = place.geometry.location.lat;
    const pLng = place.geometry.location.lng;
    const dist = distanceKm({ latitude: lat, longitude: lng }, { latitude: pLat, longitude: pLng });

    const isPharmacy = place.types?.includes('pharmacy') ?? false;

    // IMPORTANT: Never show bed counts, doctors, or "available" for unregistered facilities!
    unregisteredFacilities.push({
      id: place.place_id,
      placeId: place.place_id,
      name: place.name,
      type: isPharmacy ? 'pharmacy' : 'hospital',
      location: {
        lat: pLat,
        lng: pLng,
        address: place.vicinity || null,
      },
      distanceKm: Number(dist.toFixed(1)),
      registered: false,
      label: 'Not registered — availability unknown, call to confirm',
    });
  }

  // Sort registered first by distance, then unregistered by distance
  registeredFacilities.sort((a, b) => a.distanceKm - b.distanceKm);
  unregisteredFacilities.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    registered: registeredFacilities,
    unregistered: unregisteredFacilities,
    all: [...registeredFacilities, ...unregisteredFacilities].sort((a, b) => a.distanceKm - b.distanceKm),
  };
}
