import { requireRole } from "@/lib/auth-utils";
import { distanceKm, mapsUrl, sosCollections, type Coordinates } from "@/lib/sos";
import { getResourcesCollection, initializeIndexes } from "@/lib/models";
import { fetchPlacesNearby } from "@/lib/places";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(["ambulance_driver", "driver", "patient"]);
  if (!auth.authorized || !auth.user) {
    return Response.json(
      { error: auth.reason },
      { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 },
    );
  }

  const { id } = await params;
  await initializeIndexes();
  const { requests, drivers, hospitals } = await sosCollections();
  const isPatient = (auth.user as { role?: string }).role === "patient";
  const sos = await requests.findOne({ _id: id, ...(isPatient ? { patientId: auth.user.id } : { driverId: auth.user.id }), status: "accepted" });
  if (!sos) {
    return Response.json({ error: "Accepted SOS request not found for this driver" }, { status: 404 });
  }

  const driver = await drivers.findOne({ userId: auth.user.id });
  const origin = sos.arrivedAt ? sos.location : (driver?.location as Coordinates | undefined) ?? sos.location;
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 5);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(20, Math.floor(limitParam))) : 5;

  // 1. Fetch real registered hospitals and live resources from MongoDB (deterministic ranking, no dummy data)
  const [allHospitals, resources] = await Promise.all([
    hospitals.find({ status: { $ne: "inactive" }, isDemo: { $ne: true }, location: { $near: { $geometry: { type: "Point", coordinates: [origin.longitude, origin.latitude] }, $maxDistance: 100_000 } } }).project({ name: 1, address: 1, location: 1, status: 1, equipment: 1, placeId: 1 }).toArray(),
    (await getResourcesCollection()).find({ type: "equipment", status: { $ne: "unavailable" } }).toArray(),
  ]);

  const equipmentByHospital = new Map<string, Set<string>>();
  for (const resource of resources) {
    if (resource.availableQuantity - resource.heldQuantity <= 0) continue;
    const equipment = equipmentByHospital.get(resource.hospitalId) ?? new Set<string>();
    equipment.add(resource.category.toLowerCase());
    equipmentByHospital.set(resource.hospitalId, equipment);
  }

  const registeredCandidates = allHospitals.flatMap((hospital) => {
    const rawLocation = hospital.location as unknown as { latitude?: unknown; longitude?: unknown; coordinates?: unknown };
    const location: Coordinates | null = typeof rawLocation?.latitude === "number" && typeof rawLocation.longitude === "number"
      ? { latitude: rawLocation.latitude, longitude: rawLocation.longitude }
      : Array.isArray(rawLocation?.coordinates) && typeof rawLocation.coordinates[0] === "number" && typeof rawLocation.coordinates[1] === "number"
        ? { latitude: rawLocation.coordinates[1], longitude: rawLocation.coordinates[0] }
        : null;
    if (!location) return [];

    const equipment = new Set([
      ...(hospital.equipment ?? []).map((item: string) => item.toLowerCase()),
      ...(equipmentByHospital.get(String(hospital._id)) ?? []),
    ]);

    // Deterministic match on required equipment if any specified
    if (sos.requiredEquipment.length > 0 && !sos.requiredEquipment.every((needed) => equipment.has(needed.toLowerCase()))) {
      return [];
    }

    return [{ hospital, location, equipment: [...equipment] }];
  });

  const nearbyRegistered = registeredCandidates
    .map(({ hospital, location, equipment }) => {
      const dist = Number(distanceKm(origin, location).toFixed(1));
      const travelTimeMinutes = Math.max(1, Math.round((dist / 35) * 60) + 2);
      return {
        id: String(hospital._id),
        name: hospital.name,
        address: hospital.address ?? null,
        location,
        equipment,
        distanceKm: dist,
        travelTimeMinutes,
        directionsUrl: mapsUrl(location, origin),
        registered: true,
        label: "Live data",
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  // 2. Query Google Places for nearby unregistered hospitals as a separate fallback list
  const registeredIds = new Set(allHospitals.map((h) => String(h._id)));
  const registeredPlaceIds = new Set(allHospitals.map((h) => (h as unknown as { placeId?: string }).placeId).filter(Boolean));

  let unverifiedNearby: Array<{
    id: string;
    name: string;
    address: string | null;
    location: Coordinates;
    distanceKm: number;
    travelTimeMinutes: number;
    directionsUrl: string;
    registered: false;
    label: string;
  }> = [];

  try {
    const placesHospitals = await fetchPlacesNearby(origin.latitude, origin.longitude, "hospital", 10000);
    unverifiedNearby = placesHospitals
      .filter((place) => !registeredPlaceIds.has(place.place_id) && !registeredIds.has(place.place_id))
      .map((place) => {
        const location: Coordinates = {
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
        };
        const dist = Number(distanceKm(origin, location).toFixed(1));
        const travelTimeMinutes = Math.max(1, Math.round((dist / 35) * 60) + 2);
        return {
          id: place.place_id,
          name: place.name,
          address: place.vicinity ?? null,
          location,
          distanceKm: dist,
          travelTimeMinutes,
          directionsUrl: mapsUrl(location, origin),
          registered: false as const,
          label: "Not registered — availability unknown, call to confirm",
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  } catch (err) {
    console.warn("Could not query Places for unverified hospitals:", err);
  }

  return Response.json({
    hospitals: nearbyRegistered,
    unverifiedNearby,
    message: nearbyRegistered.length ? undefined : "No nearby hospitals registered yet",
  });
}
