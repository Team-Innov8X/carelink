import { NextRequest, NextResponse } from "next/server";
import { createHold } from "@/lib/services/hold-service";
import { getHoldsCollection } from "@/lib/models";

/**
 * POST /api/holds
 * Creates a hold-and-confirm reservation using atomic findOneAndUpdate.
 * Prevents double booking: first request wins; second gets "JUST_TAKEN" + next-ranked hospital.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      hospitalId,
      resourceType,
      category,
      requestedByUserId,
      patientDetails,
      quantity,
      originLocation,
      holdTimeoutMinutes,
      notes,
    } = body;

    // Validate required fields
    if (!hospitalId || !resourceType || !category || !requestedByUserId || !patientDetails) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: hospitalId, resourceType, category, requestedByUserId, patientDetails",
        },
        { status: 400 }
      );
    }

    const result = await createHold({
      hospitalId,
      resourceType,
      category,
      requestedByUserId,
      patientDetails,
      quantity: quantity || 1,
      originLocation,
      holdTimeoutMinutes,
      notes,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 409 }); // 409 Conflict / Just Taken
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create hold" },
      { status: 500 }
    );
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

    const query: Record<string, any> = {};

    if (hospitalId) query.hospitalId = hospitalId;
    if (requestedByUserId) query.requestedByUserId = requestedByUserId;
    if (status) query.status = status;

    const holdsCol = await getHoldsCollection();
    const holds = await holdsCol.find(query).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({
      success: true,
      count: holds.length,
      holds,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch holds" },
      { status: 500 }
    );
  }
}
