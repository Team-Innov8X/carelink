import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { errorResponse } from "@/lib/api-response";
import { getPatientBedHolds } from "@/lib/services/hold-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/holds/mine
 * Role: patient
 * Returns own requests across hospitals with current status and queue position.
 */
export async function GET() {
  try {
    const auth = await requireRole(["patient", "admin"]);
    if (!auth.authorized || !auth.user) {
      return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    }

    const holds = await getPatientBedHolds(auth.user.id);
    return NextResponse.json({
      success: true,
      holds,
    });
  } catch (error: unknown) {
    console.error("Failed to load the patient's bed requests:", error);
    return errorResponse("Could not load bed requests.", 500);
  }
}
