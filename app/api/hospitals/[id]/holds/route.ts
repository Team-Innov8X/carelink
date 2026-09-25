import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { getHoldsCollection, getHospitalsCollection } from "@/lib/models";
import { expirePendingHolds } from "@/lib/services/hold-service";
import { errorResponse } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireRole("hospital");
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse("Invalid hospital id", 400);
    const linkedHospitalId = (auth.user as typeof auth.user & { hospitalId?: string }).hospitalId;
    if (linkedHospitalId !== id) return errorResponse("Forbidden", 403);
    const hospital = await (await getHospitalsCollection()).findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } });
    if (!hospital) return errorResponse("Hospital not found", 404);
    await expirePendingHolds(id);
    const holds = await (await getHoldsCollection()).find({ hospitalId: id, status: "pending", expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).toArray();
    return NextResponse.json(holds);
  } catch {
    return errorResponse("Failed to get hospital holds", 500);
  }
}
