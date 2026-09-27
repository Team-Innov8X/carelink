import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { errorResponse, validationError } from "@/lib/api-response";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import { resourceUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse("Invalid hospital id", 400);
    if (!await (await getHospitalsCollection()).findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } })) return errorResponse("Hospital not found", 404);
    return NextResponse.json(await (await getResourcesCollection()).find({ hospitalId: id }).toArray());
  } catch { return errorResponse("Failed to get hospital resources", 500); }
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireRole("hospital");
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  let parsed;
  try { parsed = resourceUpdateSchema.safeParse(await request.json()); }
  catch { return errorResponse("Request body must be valid JSON", 400); }
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse("Invalid hospital id", 400);
    const linkedHospitalId = (auth.user as typeof auth.user & { hospitalId?: string }).hospitalId;
    if (linkedHospitalId !== id) return errorResponse("Forbidden", 403);
    if (!ObjectId.isValid(parsed.data.resourceId)) return errorResponse("Invalid resource id", 400);
    const resources = await getResourcesCollection();
    const updatedAt = new Date();
    const result = await resources.findOneAndUpdate(
      { _id: new ObjectId(parsed.data.resourceId), hospitalId: id, totalQuantity: { $gte: parsed.data.count }, heldQuantity: { $lte: parsed.data.count } },
      { $set: { status: parsed.data.status, availableQuantity: parsed.data.count, updatedAt } },
      { returnDocument: "after" },
    );
    if (!result) return errorResponse("Resource not found or count conflicts with held/total quantity", 409);
    return NextResponse.json(result);
  } catch { return errorResponse("Failed to update hospital resource", 500); }
}
