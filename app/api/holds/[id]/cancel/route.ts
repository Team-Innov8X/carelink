import { NextRequest, NextResponse } from "next/server";
import { releaseHold } from "@/lib/services/hold-service";
import { cancelHoldSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";

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
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to cancel hold" },
      { status: 500 }
    );
  }
}
