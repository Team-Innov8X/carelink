import { NextRequest, NextResponse } from "next/server";
import type { Filter } from "mongodb";
import type { HoldStatus } from "@/lib/models";
import { createHold } from "@/lib/services/hold-service";
import { getHoldsCollection } from "@/lib/models";
import { createHoldSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";

/**
 * POST /api/holds
 * Creates a hold-and-confirm reservation using atomic findOneAndUpdate.
 * Prevents double booking: first request wins; second gets "JUST_TAKEN" + next-ranked hospital.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = createHoldSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const result = await createHold({
      ...parsed.data,
    });

    if (!result.success) {
      return errorResponse(result.message || "Requested resource is unavailable", 409);
    }

    return NextResponse.json(result, { status: 201 });
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
    const { searchParams } = new URL(req.url);
    const hospitalId = searchParams.get("hospitalId");
    const requestedByUserId = searchParams.get("requestedByUserId");
    const status = searchParams.get("status");

    const query: Filter<import("@/lib/models").IHold> = {};

    if (hospitalId) query.hospitalId = hospitalId;
    if (requestedByUserId) query.requestedByUserId = requestedByUserId;
    if (status) query.status = status as HoldStatus;

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
