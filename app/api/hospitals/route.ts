import { NextResponse } from "next/server";
import { ObjectId, type Filter } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { errorResponse, validationError } from "@/lib/api-response";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import type { IHospital } from "@/lib/models/hospital";
import { hospitalCreateSchema } from "@/lib/validation";
import { expirePendingHolds } from "@/lib/services/hold-service";

export async function GET(request: Request) {
  try {
    await expirePendingHolds();
    const query = new URL(request.url).searchParams;
    const patientDirectory = query.get("view") === "patient";
    const category = query.get("emergencyType")?.trim() || query.get("specialty")?.trim();
    let hospitalIds: ObjectId[] | undefined;
    if (category) {
      const matches = await (await getResourcesCollection()).find({ category: { $regex: `^${escapeRegex(category)}$`, $options: "i" }, status: { $ne: "unavailable" }, $expr: { $gt: [{ $subtract: [{ $ifNull: ["$availableQuantity", 0] }, { $ifNull: ["$heldQuantity", 0] }] }, 0] } }).project({ hospitalId: 1 }).toArray();
      const ids = [...new Set(matches.map((item) => item.hospitalId))].filter(ObjectId.isValid).map((id) => new ObjectId(id));
      hospitalIds = ids;
    }
    const filter: Filter<IHospital> = hospitalIds
      ? { _id: { $in: hospitalIds }, status: { $ne: "inactive" } }
      : { status: { $ne: "inactive" }, ...(patientDirectory ? { name: { $not: /^CareLink\s/i } } : {}) };
    const projection = patientDirectory
      ? { name: 1, location: 1, address: 1, contact: 1, status: 1 }
      : { name: 1, location: 1, address: 1, status: 1 };
    const hospitals = await (await getHospitalsCollection()).find(filter).project(projection).toArray();
    return NextResponse.json(hospitals);
  } catch { return errorResponse("Failed to list hospitals", 500); }
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  let parsed;
  try { parsed = hospitalCreateSchema.safeParse(await request.json()); }
  catch { return errorResponse("Request body must be valid JSON", 400); }
  if (!parsed.success) return validationError(parsed.error);
  try {
    const now = new Date();
    const hospital = { ...parsed.data, code: `HOSP-${new ObjectId().toHexString().slice(-8).toUpperCase()}`, status: "active" as const, createdAt: now, updatedAt: now };
    const result = await (await getHospitalsCollection()).insertOne(hospital);
    return NextResponse.json({ ...hospital, _id: result.insertedId }, { status: 201 });
  } catch { return errorResponse("Failed to create hospital", 500); }
}

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
