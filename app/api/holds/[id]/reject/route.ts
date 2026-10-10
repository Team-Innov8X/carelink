import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { errorResponse } from "@/lib/api-response";
import { getHoldsCollection } from "@/lib/models";
import { rejectPatientBedHold, releaseHold } from "@/lib/services/hold-service";
import { writeHospitalAudit } from '@/lib/hospital-audit';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, { params }: Context) {
  const auth = await requireRole(["hospital", "hospital_staff", "admin"]);
  if (!auth.authorized || !auth.user) {
    return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  }

  try {
    const { id } = await params;
    if (!id) return errorResponse("Invalid hold id", 400);

    const holdsCol = await getHoldsCollection();
    const queryId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const linkedHospitalId = profile.role === "admin" ? null : await resolveHospitalId(profile);

    if (profile.role !== "admin" && !linkedHospitalId) {
      return errorResponse("Hospital account is not linked to a hospital", 403);
    }

    const hold = await holdsCol.findOne({
      $or: [{ _id: queryId as ObjectId }, { id }],
      ...(profile.role === "admin" ? {} : { hospitalId: linkedHospitalId! }),
      status: "pending",
    });

    if (!hold) return errorResponse("Pending hold not found for this hospital", 404);

    const result = hold.patientId
      ? await rejectPatientBedHold(id, hold.hospitalId)
      : await releaseHold(id, "rejected", hold.originLocation);
    if (!result.success) {
      const message = "error" in result ? result.error : result.message;
      const status = "status" in result ? result.status : 409;
      return errorResponse(message || "Failed to reject hold", status || 400);
    }

    await writeHospitalAudit({
      hospitalId: hold.hospitalId,
      hospitalName: profile.hospitalName || 'Hospital',
      actorId: auth.user.id,
      actorName: auth.user.name,
      action: 'Bed request rejected',
      entityType: 'request',
      entityId: id,
      details: { resourceId: hold.resourceId, patientId: hold.patientId },
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, message: "Hold rejected and next queued patient promoted." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to reject hold";
    return errorResponse(message, 500);
  }
}
