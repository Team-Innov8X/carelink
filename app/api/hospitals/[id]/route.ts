import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid hospital id" }, { status: 400 });
    const hospital = await (await getHospitalsCollection()).findOne({ _id: new ObjectId(id) });
    if (!hospital) return NextResponse.json({ error: "Hospital not found" }, { status: 404 });
    const resources = await (await getResourcesCollection()).find({ hospitalId: id }).toArray();
    return NextResponse.json({ ...hospital, resources });
  } catch {
    return NextResponse.json({ error: "Failed to get hospital" }, { status: 500 });
  }
}
