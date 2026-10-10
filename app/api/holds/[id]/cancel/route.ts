import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { transitionRequest } from "@/lib/holds";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("patient");
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await context.params;
  const hold = await transitionRequest(id, "", "cancel", auth.user!.id);
  if (!hold) return NextResponse.json({ error: "Active request not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
