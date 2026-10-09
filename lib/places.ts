import { getHospitalsCollection, getDb } from './models/db.ts';
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

// In-memory cell cache with 15-minute TTL to protect the Google Places monthly free tier
const placesCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
}

/**
 * Fetches nearby places of a specific type (hospital or pharmacy) from Google Places Nearby Search.
 * Checks the 15-minute cell cache first.
 */
export async function fetchPlacesNearby(
  lat: number,
  lng: number,
  type: 'hospital' | 'pharmacy',
  radiusMeters = 5000,
): Promise<GooglePlaceResult[]> {
  const cellKey = getCellKey(lat, lng, type);
  const cached = placesCache.get(cellKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    // If no Google Maps API key is provided, return empty array without crashing
    return [];
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', String(radiusMeters));
    url.searchParams.set('type', type);
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`Google Places search returned HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as {
      status?: string;
      results?: GooglePlaceResult[];
      error_message?: string;
    };

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn(`Google Places search status: ${data.status} - ${data.error_message || ''}`);
      return [];
    }

    const results = data.results || [];
    placesCache.set(cellKey, { timestamp: now, results });
    return results;
  } catch (error) {
    console.warn('Google Places search request failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Merges Google Places results with MongoDB registered hospitals and pharmacies.
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
  // 1. Fetch Google Places for hospital and pharmacy concurrently (with cell caching)
  const [placesHospitals, placesPharmacies] = await Promise.all([
    fetchPlacesNearby(lat, lng, 'hospital', radiusMeters),
    fetchPlacesNearby(lat, lng, 'pharmacy', radiusMeters),
  ]);

  const allPlaces = [...placesHospitals, ...placesPharmacies];

  // 2. Query registered hospitals and doctors from MongoDB
  const db = await getDb();
  const hospitalsCol = await getHospitalsCollection();
  const dbHospitals = await hospitalsCol.find({ status: { $ne: 'inactive' } }).toArray();

  const doctorsCol = db.collection('doctors');
  const resourcesCol = db.collection('resources');

  const registeredFacilities: NearbyFacility[] = [];
  const matchedPlaceIds = new Set<string>();

  for (const hosp of dbHospitals) {
    const rawLoc = hosp.location as unknown as { latitude?: number; longitude?: number; coordinates?: [number, number] };
    let hospLat: number | undefined;
    let hospLng: number | undefined;

    if (typeof rawLoc?.latitude === 'number' && typeof rawLoc?.longitude === 'number') {
      hospLat = rawLoc.latitude;
      hospLng = rawLoc.longitude;
    } else if (Array.isArray(rawLoc?.coordinates) && rawLoc.coordinates.length === 2) {
      hospLng = rawLoc.coordinates[0];
      hospLat = rawLoc.coordinates[1];
    }

    if (hospLat === undefined || hospLng === undefined) continue;

    const dist = distanceKm({ latitude: lat, longitude: lng }, { latitude: hospLat, longitude: hospLng });
    if (dist * 1000 > radiusMeters * 1.5) {
      // Out of requested radius
      continue;
    }

    const hospId = String(hosp._id ?? hosp.id);

    // Get bed info
    const bedResource = await resourcesCol.findOne({ hospitalId: hospId, type: 'bed' });
    const totalBeds = bedResource?.totalQuantity ?? hosp.capacitySummary?.totalBeds ?? 0;
    const availableBeds = bedResource
      ? Math.max(0, bedResource.availableQuantity - (bedResource.heldQuantity ?? 0))
      : hosp.capacitySummary?.availableBeds ?? 0;

    // Get doctors count
    const doctorCount = await doctorsCol.countDocuments({ hospitalId: hospId });

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
      registered: true,
      label: 'Live data',
      beds: {
        total: totalBeds,
        available: availableBeds,
      },
      doctors: {
        count: doctorCount,
      },
      status: hosp.status || 'active',
    });
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
    all: [...registeredFacilities, ...unregisteredFacilities],
  };
}
