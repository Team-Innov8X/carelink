import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { errorResponse } from "@/lib/api-response";
import { getHoldsCollection } from "@/lib/models";
import { releaseHold } from "@/lib/services/hold-service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, { params }: Context) {
  const auth = await requireRole("hospital");
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse("Invalid hold id", 400);
    const hospitalId = (auth.user as typeof auth.user & { hospitalId?: string }).hospitalId;
    if (!hospitalId) return errorResponse("Hospital account is not linked to a hospital", 403);
    const hold = await (await getHoldsCollection()).findOne({ _id: new ObjectId(id), hospitalId, status: "pending" });
    if (!hold) return errorResponse("Pending hold not found", 404);
    // Release the lock and server-side rerank immediately so rejection cannot strand the request.
    const result = await releaseHold(id, "rejected", hold.originLocation);
    if (!result.success) return errorResponse(result.message, 409);
    return NextResponse.json({ hold: { ...hold, status: "rejected" }, autoEscalation: result.nextRankedHospital });
  } catch {
    return errorResponse("Failed to reject hold", 500);
  }
}
