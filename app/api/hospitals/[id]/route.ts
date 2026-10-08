import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import { distanceKm, mapsUrl, type Coordinates } from "@/lib/sos";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const hospitals = await getHospitalsCollection();
    const resourcesCollection = await getResourcesCollection();

    let hospital = ObjectId.isValid(id)
      ? await hospitals.findOne({ _id: new ObjectId(id) })
      : null;

    if (!hospital) {
      hospital = await hospitals.findOne({ $or: [{ code: id }, { _id: id as unknown as ObjectId }] });
    }

    if (!hospital) {
      return NextResponse.json({ error: "Hospital not found" }, { status: 404 });
    }

    const hospitalIdStr = hospital._id?.toString() ?? id;
    const resources = await resourcesCollection.find({
      $or: [{ hospitalId: hospitalIdStr }, { hospitalId: id }],
    }).toArray();

    // Parse optional origin location for directions & distance
    const url = new URL(request.url);
    const originLat = url.searchParams.get("lat") ? Number(url.searchParams.get("lat")) : null;
    const originLng = url.searchParams.get("lng") ? Number(url.searchParams.get("lng")) : null;

    const hospCoords = hospital.location?.coordinates;
    const hospitalLocation: Coordinates = hospCoords && hospCoords.length >= 2
      ? { latitude: hospCoords[1], longitude: hospCoords[0] }
      : { latitude: 28.6139, longitude: 77.209 };

    let patientOrigin: Coordinates | undefined;
    let distanceInKm: number | null = null;

    if (originLat !== null && originLng !== null && Number.isFinite(originLat) && Number.isFinite(originLng)) {
      patientOrigin = { latitude: originLat, longitude: originLng };
      distanceInKm = Number(distanceKm(patientOrigin, hospitalLocation).toFixed(1));
    }

    const directionsUrl = mapsUrl(hospitalLocation, patientOrigin);

    // Extract doctors/specialists from doctors collection
    const doctorsCol = await (await import("@/lib/models")).getDoctorsCollection();
    const realDoctors = await doctorsCol.find({
      $or: [{ hospitalId: hospitalIdStr }, { hospitalId: id }, ...(hospital.code ? [{ hospitalId: hospital.code }] : [])],
    }).sort({ updatedAt: -1 }).toArray();

    const doctors = realDoctors.map((d) => ({
      id: d._id?.toString() ?? d.id,
      name: d.name,
      qualification: d.qualification,
      specialization: d.specialization,
      availability: d.availability,
      available: d.availability === "available",
      phone: d.phone,
      experienceYears: d.experienceYears,
      status: d.availability,
    }));

    // Extract bed availability breakdown
    const bedResources = resources.filter((r) => r.type === "bed");
    const beds = {
      general: { available: 0, total: 0 },
      icu: { available: 0, total: 0 },
      trauma: { available: 0, total: 0 },
      ventilators: { available: 0, total: 0 },
    };

    for (const b of bedResources) {
      const cat = b.category.toLowerCase();
      if (cat.includes("icu")) {
        beds.icu.available += b.availableQuantity;
        beds.icu.total += b.totalQuantity;
      } else if (cat.includes("trauma") || cat.includes("emergency")) {
        beds.trauma.available += b.availableQuantity;
        beds.trauma.total += b.totalQuantity;
      } else {
        beds.general.available += b.availableQuantity;
        beds.general.total += b.totalQuantity;
      }
    }

    const ventilatorResources = resources.filter((r) => r.type === "equipment" && r.category.toLowerCase().includes("ventilator"));
    for (const v of ventilatorResources) {
      beds.ventilators.available += v.availableQuantity;
      beds.ventilators.total += v.totalQuantity;
    }

    // If hospital has capacitySummary, blend or fallback
    if (hospital.capacitySummary) {
      if (beds.general.total === 0) beds.general.total = hospital.capacitySummary.totalBeds;
      if (beds.general.available === 0) beds.general.available = hospital.capacitySummary.availableBeds;
      if (beds.ventilators.total === 0) beds.ventilators.total = hospital.capacitySummary.totalVentilators;
      if (beds.ventilators.available === 0) beds.ventilators.available = hospital.capacitySummary.availableVentilators;
    }

    // Aggregate unique specialties
    const specialtySet = new Set<string>();
    for (const doc of doctors) {
      if (doc.specialization) specialtySet.add(doc.specialization);
    }
    for (const res of resources) {
      if (typeof res.category === "string") {
        specialtySet.add(res.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      }
    }
    const specialties = Array.from(specialtySet);

    return NextResponse.json({
      id: hospitalIdStr,
      _id: hospitalIdStr,
      name: hospital.name,
      code: hospital.code,
      status: hospital.status,
      address: hospital.address,
      contact: hospital.contact,
      location: hospital.location,
      coordinates: hospitalLocation,
      distanceKm: distanceInKm,
      directionsUrl,
      doctors,
      beds,
      specialties: specialties.length ? specialties : ["Emergency Care", "General Medicine"],
      resources,
    });
  } catch (error) {
    console.error("Failed to get hospital details:", error);
    return NextResponse.json({ error: "Failed to get hospital" }, { status: 500 });
  }
}
