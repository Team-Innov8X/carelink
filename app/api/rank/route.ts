import { NextResponse } from "next/server";
import { rankHospitals } from "@/lib/ranking.mjs";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";

type RankRequest = {
  emergencyType: string;
  ambulanceLocation: { latitude: number; longitude: number };
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isRankRequest(body)) {
    return NextResponse.json({
      error: "Provide emergencyType and ambulanceLocation with valid latitude and longitude.",
    }, { status: 400 });
  }

  try {
    const [hospitalDocuments, resources] = await Promise.all([
      (await getHospitalsCollection()).find({ status: { $ne: "inactive" } }).toArray(),
      (await getResourcesCollection()).find({}).toArray(),
    ]);

    const hospitals = hospitalDocuments.map((hospital) => ({
      id: hospital._id?.toString() ?? hospital.id ?? hospital.code,
      name: hospital.name,
      location: hospital.location,
      status: hospital.status,
    }));

    const ranked = rankHospitals({
      emergencyType: body.emergencyType,
      ambulanceLocation: body.ambulanceLocation,
      hospitals,
      resources: resources.map((resource) => ({
        hospitalId: resource.hospitalId,
        type: resource.type,
        category: resource.category,
        availableQuantity: resource.availableQuantity,
        status: resource.status,
      })),
    });

    return NextResponse.json({ emergencyType: body.emergencyType, ranked });
  } catch {
    return NextResponse.json({ error: "Failed to rank hospitals." }, { status: 500 });
  }
}

function isRankRequest(value: unknown): value is RankRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (typeof body.emergencyType !== "string" || !body.emergencyType.trim()) return false;
  if (!body.ambulanceLocation || typeof body.ambulanceLocation !== "object") return false;
  const location = body.ambulanceLocation as Record<string, unknown>;
  return typeof location.latitude === "number" && Number.isFinite(location.latitude) &&
    location.latitude >= -90 && location.latitude <= 90 &&
    typeof location.longitude === "number" && Number.isFinite(location.longitude) &&
    location.longitude >= -180 && location.longitude <= 180;
}
