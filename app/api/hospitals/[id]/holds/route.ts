import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { expireDueRequests } from "@/lib/holds";
import { getHoldsCollection } from "@/lib/models/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("hospital_staff");
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await context.params;
  if ((auth.user as { hospitalId?: string }).hospitalId !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await expireDueRequests(id);
  const holds = await getHoldsCollection();
  const requests = await holds.find({ hospitalId: id, status: "pending" }).sort({ seq: 1 }).toArray();
  return NextResponse.json(requests);
}
