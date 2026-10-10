import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { confirmHold, confirmPatientBedHold } from "@/lib/services/hold-service";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { errorResponse } from "@/lib/api-response";
import { getHoldsCollection } from "@/lib/models";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["hospital", "hospital_staff", "admin"]);
  if (!auth.authorized || !auth.user) {
    return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  }

  try {
    const { id } = await params;
    if (!id) return errorResponse("Missing hold id", 400);

    const holdsCol = await getHoldsCollection();
    const queryId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const linkedHospitalId = profile.role === "admin" ? null : await resolveHospitalId(profile);

    if (profile.role !== "admin" && !linkedHospitalId) {
      return errorResponse("Hospital account is not linked to a hospital", 403);
    }

    const ownedHold = await holdsCol.findOne({
      $or: [{ _id: queryId as ObjectId }, { id }],
      ...(profile.role === "admin" ? {} : { hospitalId: linkedHospitalId! }),
      status: "pending",
    });

    if (!ownedHold) return errorResponse("Pending hold not found for this hospital", 404);

    const result = ownedHold.patientId
      ? await confirmPatientBedHold(id, ownedHold.hospitalId, auth.user.id)
      : await confirmHold(id, auth.user.id);
    if (!result.success) {
      const message = "message" in result ? result.message : "error" in result ? result.error : undefined;
      const status = "status" in result ? result.status : 409;
      return errorResponse(message || "Failed to confirm hold", status || 400);
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to confirm hold";
    return errorResponse(message, 500);
  }
}
