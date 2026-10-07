import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getHoldsCollection } from "@/lib/models";
import { releaseHold } from "@/lib/services/hold-service";
import { errorResponse } from "@/lib/api-response";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const auth = await requireRole();
    if (!auth.authorized || !auth.user) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse("Invalid hold id", 400);
    const holds = await getHoldsCollection();
    let hold = await holds.findOne({ _id: new ObjectId(id) });
    if (!hold) return errorResponse("Hold not found", 404);
    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const linkedHospitalId = profile.role === "hospital" || profile.role === "hospital_staff" ? await resolveHospitalId(profile) : null;
    const canRead = profile.role === "admin" || profile.role === "dispatcher"
      || (profile.role === "hospital" || profile.role === "hospital_staff") && linkedHospitalId === hold.hospitalId
      || hold.requestedByUserId === auth.user.id;
    if (!canRead) return errorResponse("Forbidden", 403);
    let autoEscalation = null;
    if (hold.status === "pending" && hold.expiresAt && hold.expiresAt <= new Date()) {
      const result = await releaseHold(id, "expired", hold.originLocation);
      if (result.success) autoEscalation = result.nextRankedHospital;
      hold = await holds.findOne({ _id: new ObjectId(id) }) ?? hold;
    }
    return NextResponse.json(autoEscalation ? { ...hold, autoEscalation } : hold);
  } catch {
    return errorResponse("Failed to get hold", 500);
  }
}
