import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole } from "@/lib/auth-utils";
import { getHoldsCollection, getHospitalsCollection } from "@/lib/models";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireRole("hospital");
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid hospital id" }, { status: 400 });
    const linkedHospitalId = (auth.user as typeof auth.user & { hospitalId?: string }).hospitalId;
    if (linkedHospitalId !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const hospital = await (await getHospitalsCollection()).findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } });
    if (!hospital) return NextResponse.json({ error: "Hospital not found" }, { status: 404 });
    const holds = await (await getHoldsCollection()).find({ hospitalId: id, status: "pending", expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).toArray();
    return NextResponse.json(holds);
  } catch {
    return NextResponse.json({ error: "Failed to get hospital holds" }, { status: 500 });
  }
}
