import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getHoldsCollection } from "@/lib/models";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid hold id" }, { status: 400 });
    const hold = await (await getHoldsCollection()).findOne({ _id: new ObjectId(id) });
    if (!hold) return NextResponse.json({ error: "Hold not found" }, { status: 404 });
    return NextResponse.json(hold);
  } catch {
    return NextResponse.json({ error: "Failed to get hold" }, { status: 500 });
  }
}
