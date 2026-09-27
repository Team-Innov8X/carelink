import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid hospital id" }, { status: 400 });
    const hospitals = await getHospitalsCollection();
    const exists = await hospitals.findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } });
    if (!exists) return NextResponse.json({ error: "Hospital not found" }, { status: 404 });
    const resources = await (await getResourcesCollection()).find({ hospitalId: id }).toArray();
    return NextResponse.json(resources);
  } catch {
    return NextResponse.json({ error: "Failed to get hospital resources" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireRole("hospital");
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid hospital id" }, { status: 400 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const { resourceId, status, count } = body as Record<string, unknown>;
    if (typeof resourceId !== "string" || !ObjectId.isValid(resourceId) ||
      !["available", "limited", "unavailable"].includes(String(status)) ||
      typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      return NextResponse.json({ error: "resourceId, a valid status, and a non-negative integer count are required" }, { status: 400 });
    }

    const resources = await getResourcesCollection();
    const resource = await resources.findOne({ _id: new ObjectId(resourceId), hospitalId: id });
    if (!resource) return NextResponse.json({ error: "Resource not found for this hospital" }, { status: 404 });
    if (count > resource.totalQuantity || count < resource.heldQuantity) {
      return NextResponse.json({ error: "Count must be between held quantity and total quantity" }, { status: 400 });
    }

    const resourceStatus = status as "available" | "limited" | "unavailable";
    const updatedAt = new Date();
    await resources.updateOne(
      { _id: resource._id, hospitalId: id },
      { $set: { status: resourceStatus, availableQuantity: count, updatedAt } },
    );
    return NextResponse.json({ ...resource, status: resourceStatus, availableQuantity: count, updatedAt });
  } catch {
    return NextResponse.json({ error: "Failed to update hospital resource" }, { status: 500 });
  }
}
