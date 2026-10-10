import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { getHospitalsCollection } from "@/lib/models";
import { getHospitalPendingBedHolds } from "@/lib/services/hold-service";
import { errorResponse } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireRole(["hospital", "hospital_staff", "admin"]);
  if (!auth.authorized || !auth.user) {
    return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  }

  try {
    const { id } = await params;
    if (!id) return errorResponse("Invalid hospital id", 400);

    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const linkedHospitalId = profile.role === "admin" ? id : await resolveHospitalId(profile);
    if (profile.role !== "admin" && linkedHospitalId !== id) return errorResponse("Forbidden", 403);

    const hospitalsCol = await getHospitalsCollection();
    const queryId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const hospital = await hospitalsCol.findOne({
      $or: [{ _id: queryId as ObjectId }, { id }, { code: id }],
    });
    if (!hospital) return errorResponse("Hospital not found", 404);

    const result = await getHospitalPendingBedHolds(id);
    return NextResponse.json({
      success: true,
      holds: result.holds,
      queueLength: result.queueLength,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get hospital holds";
    return errorResponse(message, 500);
  }
}
