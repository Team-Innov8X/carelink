import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { confirmHold } from "@/lib/services/hold-service";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { errorResponse } from "@/lib/api-response";
import { getHoldsCollection } from "@/lib/models";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["hospital", "hospital_staff", "admin"]);
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse("Invalid hold id", 400);
    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const linkedHospitalId = profile.role === "admin" ? null : await resolveHospitalId(profile);
    if (profile.role !== "admin" && !linkedHospitalId) return errorResponse("Hospital account is not linked to a hospital", 403);
    const ownedHold = await (await getHoldsCollection()).findOne({ _id: new ObjectId(id), ...(profile.role === "admin" ? {} : { hospitalId: linkedHospitalId! }), status: "pending" });
    if (!ownedHold) return errorResponse("Pending hold not found", 404);
    const result = await confirmHold(id, auth.user.id);
    if (!result.success) return errorResponse(result.message, 409);
    return NextResponse.json(result);
  } catch {
    return errorResponse("Failed to confirm hold", 500);
  }
}
