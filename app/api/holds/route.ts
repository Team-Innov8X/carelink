import { NextRequest, NextResponse } from "next/server";
import type { Filter } from "mongodb";
import type { HoldStatus } from "@/lib/models";
import { createHold, expirePendingHolds } from "@/lib/services/hold-service";
import { getHoldsCollection, getResourcesCollection } from "@/lib/models";
import { createHoldSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { ObjectId } from "mongodb";

/**
 * POST /api/holds
 * Creates a hold-and-confirm reservation using atomic findOneAndUpdate.
 * Prevents double booking: first request wins; second gets "JUST_TAKEN" + next-ranked hospital.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(["ambulance_driver", "driver", "dispatcher"]);
    if (!auth.authorized || !auth.user) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    const parsed = createHoldSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const resources = await getResourcesCollection();
    const requestedResourceId = parsed.data.resourceId;
    const resource = requestedResourceId
      ? await resources.findOne({ _id: ObjectId.isValid(requestedResourceId) ? new ObjectId(requestedResourceId) : requestedResourceId, hospitalId: parsed.data.hospitalId })
      : null;
    if (requestedResourceId && !resource) return errorResponse("Resource not found at this hospital", 404);
    const resourceType = resource?.type ?? parsed.data.resourceType;
    const category = resource?.category ?? parsed.data.category;
    if (!resourceType || !category) return errorResponse("Resource type and category are required", 400);

    const result = await createHold({
      ...parsed.data,
      resourceId: resource?._id?.toString(),
      resourceType,
      category,
      requestedByUserId: auth.user.id,
      ambulanceId: (auth.user as typeof auth.user & { role?: string; vehicleNumber?: string }).role === "dispatcher"
        ? parsed.data.ambulanceId
        : (auth.user as typeof auth.user & { vehicleNumber?: string }).vehicleNumber ?? auth.user.id,
    });

    if (!result.success) {
      return errorResponse(result.message || "Requested resource is unavailable", 409);
    }

    return NextResponse.json({ ...result, holdId: result.hold?.id, status: result.hold?.status, expiresAt: result.hold?.expiresAt }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create hold";
    return errorResponse(error instanceof SyntaxError ? "Request body must be valid JSON" : message, error instanceof SyntaxError ? 400 : 500);
  }
}

/**
 * GET /api/holds
 * List holds filtered by hospitalId, requestedByUserId, or status.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole();
    if (!auth.authorized || !auth.user) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    const { searchParams } = new URL(req.url);
    const hospitalId = searchParams.get("hospitalId");
    const requestedByUserId = searchParams.get("requestedByUserId");
    const status = searchParams.get("status");

    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const role = profile.role;
    const query: Filter<import("@/lib/models").IHold> = {};

    if (role === "hospital" || role === "hospital_staff") {
      const linkedHospitalId = await resolveHospitalId(profile);
      if (!linkedHospitalId) return errorResponse("Hospital account is not linked to a hospital", 403);
      if (hospitalId && hospitalId !== linkedHospitalId) return errorResponse("Forbidden", 403);
      query.hospitalId = linkedHospitalId;
    } else if (role !== "admin" && role !== "dispatcher") {
      if (requestedByUserId && requestedByUserId !== auth.user.id) return errorResponse("Forbidden", 403);
      query.requestedByUserId = auth.user.id;
    } else if (requestedByUserId) query.requestedByUserId = requestedByUserId;

    if (hospitalId && role !== "hospital" && role !== "hospital_staff") query.hospitalId = hospitalId;
    const validStatuses: HoldStatus[] = ["pending", "confirming", "confirmed", "fulfilled", "expired", "rejected", "cancelled"];
    if (status) {
      if (!validStatuses.includes(status as HoldStatus)) return errorResponse("Invalid hold status", 400);
      query.status = status as HoldStatus;
    }

    await expirePendingHolds();
    const holdsCol = await getHoldsCollection();
    const holds = await holdsCol.find(query).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({
      success: true,
      count: holds.length,
      holds,
    });
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : "Failed to fetch holds", 500);
  }
}
