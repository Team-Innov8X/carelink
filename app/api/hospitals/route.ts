import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const emergencyType = url.searchParams.get("emergencyType")?.trim();
    const specialty = url.searchParams.get("specialty")?.trim();
    const resources = await getResourcesCollection();
    const conditions: Record<string, unknown>[] = [];

    if (emergencyType) {
      conditions.push({ type: "bed", category: { $regex: `^${escapeRegex(emergencyType)}$`, $options: "i" } });
    }
    if (specialty) {
      conditions.push({ type: "specialist", category: { $regex: `^${escapeRegex(specialty)}$`, $options: "i" } });
    }

    let matchingHospitalIds: ObjectId[] | undefined;
    if (conditions.length) {
      const matchedResources = await resources.find({ $or: conditions }).project({ hospitalId: 1 }).toArray();
      matchingHospitalIds = [...new Set(matchedResources.map((resource) => resource.hospitalId))]
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));
    }

    const hospitals = await (await getHospitalsCollection())
      .find(matchingHospitalIds ? { _id: { $in: matchingHospitalIds } } : {})
      .project({ name: 1, location: 1, address: 1 })
      .toArray();
    return NextResponse.json(hospitals);
  } catch {
    return NextResponse.json({ error: "Failed to list hospitals" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  try {
    const body = await request.json();
    if (!isHospitalInput(body)) {
      return NextResponse.json({ error: "Invalid hospital. name, location, address, and contact are required." }, { status: 400 });
    }
    const now = new Date();
    const hospital = {
      name: body.name.trim(),
      code: `HOSP-${new ObjectId().toHexString().slice(-8).toUpperCase()}`,
      location: body.location,
      address: body.address,
      contact: body.contact,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };
    const result = await (await getHospitalsCollection()).insertOne(hospital);
    return NextResponse.json({ ...hospital, _id: result.insertedId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create hospital" }, { status: 500 });
  }
}

function isHospitalInput(value: unknown): value is {
  name: string;
  location: { type: "Point"; coordinates: [number, number] };
  address: { street: string; city: string; state: string; zipCode: string; country: string };
  contact: { phone: string; email: string; emergencyHotline: string };
} {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, any>;
  return typeof body.name === "string" && !!body.name.trim() &&
    body.location?.type === "Point" && Array.isArray(body.location.coordinates) && body.location.coordinates.length === 2 &&
    body.location.coordinates.every((coordinate: unknown) => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    ["street", "city", "state", "zipCode", "country"].every((key) => typeof body.address?.[key] === "string") &&
    ["phone", "email", "emergencyHotline"].every((key) => typeof body.contact?.[key] === "string");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
