import { NextRequest, NextResponse } from "next/server";
import { releaseHold } from "@/lib/services/hold-service";

/**
 * POST /api/holds/[id]/cancel
 * Cancels/releases a hold document and auto-escalates to the next-ranked hospital.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing hold ID parameter" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const reason = body?.reason === "expired" ? "expired" : "cancelled";
    const originLocation = body?.originLocation; // [lng, lat] for next-ranked hospital search

    const result = await releaseHold(id, reason, originLocation);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to cancel hold" },
      { status: 500 }
    );
  }
}
