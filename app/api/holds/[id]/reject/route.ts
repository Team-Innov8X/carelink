import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { getHoldsCollection, getResourcesCollection } from "@/lib/models";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, { params }: Context) {
  const auth = await requireRole("hospital");
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid hold id" }, { status: 400 });
    const hospitalId = (auth.user as typeof auth.user & { hospitalId?: string }).hospitalId;
    if (!hospitalId) return NextResponse.json({ error: "Hospital account is not linked to a hospital" }, { status: 403 });
    const holds = await getHoldsCollection();
    const hold = await holds.findOneAndUpdate(
      { _id: new ObjectId(id), hospitalId, status: "pending" },
      { $set: { status: "rejected", updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!hold) return NextResponse.json({ error: "Pending hold not found" }, { status: 404 });
    await (await getResourcesCollection()).updateOne(
      { _id: new ObjectId(hold.resourceId), hospitalId: hold.hospitalId },
      { $inc: { availableQuantity: hold.quantity, heldQuantity: -hold.quantity }, $set: { updatedAt: new Date() } },
    );
    // The updated availability is ready for the caller's hospital re-ranking flow.
    return NextResponse.json({ hold, rerankRequired: true });
  } catch {
    return NextResponse.json({ error: "Failed to reject hold" }, { status: 500 });
  }
}
