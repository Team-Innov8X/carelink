import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getHoldsCollection } from "@/lib/models";
import { releaseHold } from "@/lib/services/hold-service";
import { errorResponse } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse("Invalid hold id", 400);
    let hold = await (await getHoldsCollection()).findOne({ _id: new ObjectId(id) });
    if (!hold) return errorResponse("Hold not found", 404);
    let autoEscalation = null;
    if (hold.status === "pending" && hold.expiresAt <= new Date()) {
      const result = await releaseHold(id, "expired", hold.originLocation);
      if (result.success) autoEscalation = result.nextRankedHospital;
      hold = await (await getHoldsCollection()).findOne({ _id: new ObjectId(id) }) ?? hold;
    }
    return NextResponse.json(autoEscalation ? { ...hold, autoEscalation } : hold);
  } catch {
    return errorResponse("Failed to get hold", 500);
  }
}
