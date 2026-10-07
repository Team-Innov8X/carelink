import { NextResponse } from "next/server";
import { ObjectId, type Filter } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { errorResponse, validationError } from "@/lib/api-response";
import { getHospitalsCollection, getResourcesCollection, initializeIndexes } from "@/lib/models";
import type { IHospital } from "@/lib/models/hospital";
import { hospitalCreateSchema } from "@/lib/validation";
import { expirePendingHolds } from "@/lib/services/hold-service";
import { distanceKm, mapsUrl, type Coordinates } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await initializeIndexes();
    await expirePendingHolds();

    const query = new URL(request.url).searchParams;
    const patientDirectory = query.get("view") === "patient";
    const category = query.get("emergencyType")?.trim() || query.get("specialty")?.trim();

    const latParam = query.get("lat");
    const lngParam = query.get("lng");
    const radiusParam = query.get("radiusKm");

    const patientLat = latParam ? Number(latParam) : null;
    const patientLng = lngParam ? Number(lngParam) : null;
    const radiusKm = radiusParam && Number(radiusParam) > 0 ? Number(radiusParam) : 50;

    const hasLocation = patientLat !== null && patientLng !== null && Number.isFinite(patientLat) && Number.isFinite(patientLng);
    const patientLocation: Coordinates | undefined = hasLocation ? { latitude: patientLat!, longitude: patientLng! } : undefined;

    let hospitalIds: ObjectId[] | undefined;
    if (category) {
      const matches = await (await getResourcesCollection())
        .find({
          category: { $regex: `^${escapeRegex(category)}$`, $options: "i" },
          status: { $ne: "unavailable" },
          $expr: {
            $gt: [
              { $subtract: [{ $ifNull: ["$availableQuantity", 0] }, { $ifNull: ["$heldQuantity", 0] }] },
              0,
            ],
          },
        })
        .project({ hospitalId: 1 })
        .toArray();
      const ids = [...new Set(matches.map((item) => item.hospitalId))].filter(ObjectId.isValid).map((id) => new ObjectId(id));
      hospitalIds = ids;
    }

    const filter: Filter<IHospital> = hospitalIds
      ? { _id: { $in: hospitalIds }, status: { $ne: "inactive" } }
      : { status: { $ne: "inactive" }, ...(patientDirectory ? { name: { $not: /^CareLink\s/i } } : {}) };

    // Geospatial query when coordinates are provided
    if (hasLocation) {
      // 1 radian is approx 6378.1 km
      const radiusInRadians = radiusKm / 6378.1;
      filter.location = {
        $geoWithin: {
          $centerSphere: [[patientLng!, patientLat!], radiusInRadians],
        },
      };
    }

    const hospitalsCollection = await getHospitalsCollection();
    const rawHospitals = await hospitalsCollection.find(filter).toArray();

    // If patient requested geospatial search, calculate distance and sort
    const resourcesCollection = await getResourcesCollection();
    const allResources = await resourcesCollection.find({ status: { $ne: "unavailable" } }).toArray();

    const resourcesByHospitalId = new Map<string, typeof allResources>();
    for (const res of allResources) {
      const list = resourcesByHospitalId.get(res.hospitalId) || [];
      list.push(res);
      resourcesByHospitalId.set(res.hospitalId, list);
    }

    const enriched = rawHospitals.map((hosp) => {
      const hospId = hosp._id?.toString() ?? "";
      const coords = hosp.location?.coordinates;
      const hospCoords: Coordinates = coords && coords.length >= 2
        ? { latitude: coords[1], longitude: coords[0] }
        : { latitude: 28.6139, longitude: 77.209 };

      const dist = patientLocation ? Number(distanceKm(patientLocation, hospCoords).toFixed(1)) : null;
      const hospResources = resourcesByHospitalId.get(hospId) || resourcesByHospitalId.get(hosp.code) || [];

      const specialtiesSet = new Set<string>();
      const beds = {
        general: { available: 0, total: 0 },
        icu: { available: 0, total: 0 },
        trauma: { available: 0, total: 0 },
        ventilators: { available: 0, total: 0 },
      };

      for (const res of hospResources) {
        if (res.type === "specialist") {
          const spec = res.specialization || (typeof res.category === "string" ? res.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
          if (spec) specialtiesSet.add(spec);
        } else if (res.type === "bed") {
          const cat = res.category.toLowerCase();
          if (cat.includes("icu")) {
            beds.icu.available += res.availableQuantity;
            beds.icu.total += res.totalQuantity;
          } else if (cat.includes("trauma") || cat.includes("emergency")) {
            beds.trauma.available += res.availableQuantity;
            beds.trauma.total += res.totalQuantity;
          } else {
            beds.general.available += res.availableQuantity;
            beds.general.total += res.totalQuantity;
          }
        } else if (res.type === "equipment" && res.category.toLowerCase().includes("ventilator")) {
          beds.ventilators.available += res.availableQuantity;
          beds.ventilators.total += res.totalQuantity;
        }
      }

      if (hosp.capacitySummary) {
        if (beds.general.total === 0) beds.general.total = hosp.capacitySummary.totalBeds;
        if (beds.general.available === 0) beds.general.available = hosp.capacitySummary.availableBeds;
        if (beds.ventilators.total === 0) beds.ventilators.total = hosp.capacitySummary.totalVentilators;
        if (beds.ventilators.available === 0) beds.ventilators.available = hosp.capacitySummary.availableVentilators;
      }

      const specialties = specialtiesSet.size > 0
        ? Array.from(specialtiesSet)
        : ["General Care", "Emergency Care", "ICU"];

      return {
        id: hospId,
        _id: hospId,
        name: hosp.name,
        code: hosp.code,
        status: hosp.status,
        address: hosp.address,
        location: hosp.location,
        coordinates: hospCoords,
        contact: hosp.contact,
        phone: hosp.contact?.emergencyHotline || hosp.contact?.phone || "",
        distanceKm: dist,
        directionsUrl: mapsUrl(hospCoords, patientLocation),
        specialties,
        beds,
        capacitySummary: hosp.capacitySummary,
      };
    });

    if (patientLocation) {
      enriched.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    }

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("Failed to list hospitals:", err);
    return errorResponse("Failed to list hospitals", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  let parsed;
  try {
    parsed = hospitalCreateSchema.safeParse(await request.json());
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }
  if (!parsed.success) return validationError(parsed.error);
  try {
    const now = new Date();
    const hospital = {
      ...parsed.data,
      code: `HOSP-${new ObjectId().toHexString().slice(-8).toUpperCase()}`,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };
    const result = await (await getHospitalsCollection()).insertOne(hospital);
    return NextResponse.json({ ...hospital, _id: result.insertedId }, { status: 201 });
  } catch {
    return errorResponse("Failed to create hospital", 500);
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
