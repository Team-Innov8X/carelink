import { NextRequest, NextResponse } from "next/server";
import { releaseHold } from "@/lib/services/hold-service";
import { cancelHoldSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { ObjectId } from "mongodb";
import { getHoldsCollection } from "@/lib/models";

/**
 * POST /api/holds/[id]/cancel
 * Cancels/releases a hold document and auto-escalates to the next-ranked hospital.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole();
    if (!auth.authorized || !auth.user) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing hold ID parameter" },
        { status: 400 }
      );
    }
    if (!ObjectId.isValid(id)) return errorResponse("Invalid hold id", 400);
    const hold = await (await getHoldsCollection()).findOne({ _id: new ObjectId(id), status: "pending" });
    if (!hold) return errorResponse("Pending hold not found", 404);
    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const linkedHospitalId = profile.role === "hospital" || profile.role === "hospital_staff" ? await resolveHospitalId(profile) : null;
    const canCancel = profile.role === "admin" || profile.role === "dispatcher"
      || (profile.role === "hospital" || profile.role === "hospital_staff") && linkedHospitalId === hold.hospitalId
      || hold.requestedByUserId === auth.user.id;
    if (!canCancel) return errorResponse("Forbidden", 403);

    let body: unknown = {};
    try { body = await req.json(); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    const parsed = cancelHoldSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const reason = parsed.data?.reason ?? "cancelled";
    const originLocation = parsed.data?.originLocation;

    const result = await releaseHold(id, reason, originLocation);

    if (!result.success) {
      return errorResponse(result.message, 409);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel hold";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
