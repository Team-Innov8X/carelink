import { NextRequest, NextResponse } from "next/server";
import { cancelPatientBedHold, releaseHold } from "@/lib/services/hold-service";
import { cancelHoldSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { ObjectId } from "mongodb";
import { getHoldsCollection } from "@/lib/models";

type Context = { params: Promise<{ id: string }> };

async function handleCancel(req: NextRequest, { params }: Context) {
  try {
    const auth = await requireRole(["patient", "hospital", "hospital_staff", "dispatcher", "admin"]);
    if (!auth.authorized || !auth.user) {
      return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    }
    const { id } = await params;
    if (!id) return errorResponse("Missing hold ID parameter", 400);

    const holdsCol = await getHoldsCollection();
    const queryId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const hold = await holdsCol.findOne({
      $or: [{ _id: queryId as ObjectId }, { id }],
    });
    if (!hold) return errorResponse("Hold not found", 404);

    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const isOwner = hold.patientId === auth.user.id || hold.requestedByUserId === auth.user.id;
    const linkedHospitalId = profile.role === "hospital" || profile.role === "hospital_staff" ? await resolveHospitalId(profile) : null;
    const isHospitalOwner = linkedHospitalId && linkedHospitalId === hold.hospitalId;
    const isAdminOrDispatcher = profile.role === "admin" || profile.role === "dispatcher";

    if (!isOwner && !isHospitalOwner && !isAdminOrDispatcher) {
      return errorResponse("Forbidden", 403);
    }

    // Patient bed hold cancellation
    const cancelRes = await cancelPatientBedHold(id, hold.patientId || auth.user.id);
    if (!cancelRes.success) {
      return errorResponse(cancelRes.error || "Failed to cancel hold", cancelRes.status || 400);
    }

    return NextResponse.json(cancelRes, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel hold";
    return errorResponse(message, 500);
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  return handleCancel(req, context);
}

export async function POST(req: NextRequest, context: Context) {
  return handleCancel(req, context);
}
