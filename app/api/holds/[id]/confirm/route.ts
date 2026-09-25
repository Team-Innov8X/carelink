import { NextRequest, NextResponse } from "next/server";
import { confirmHold } from "@/lib/services/hold-service";

/**
 * POST /api/holds/[id]/confirm
 * Hospital confirms a pending hold.
 * Decrements availableQuantity & heldQuantity (resource officially occupied).
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
    const confirmedByUserId = body?.confirmedByUserId;

    const result = await confirmHold(id, confirmedByUserId);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to confirm hold" },
      { status: 500 }
    );
  }
}
