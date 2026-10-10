import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { transitionRequest } from "@/lib/holds";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("hospital_staff");
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const hospitalId = (auth.user as { hospitalId?: string }).hospitalId;
  if (!hospitalId) return NextResponse.json({ error: "Hospital account is not linked to a hospital" }, { status: 403 });
  const { id } = await context.params;
  const hold = await transitionRequest(id, hospitalId, "reject");
  if (!hold) return NextResponse.json({ error: "Pending request not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
