import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { errorResponse, validationError } from "@/lib/api-response";
import { getUsersCollection } from "@/lib/models";
import { isValidRole, roleUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireRole("admin");
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  let parsed;
  try { parsed = roleUpdateSchema.safeParse(await request.json()); }
  catch { return errorResponse("Request body must be valid JSON", 400); }
  if (!parsed.success) return validationError(parsed.error);
  if (!isValidRole(parsed.data.role)) return errorResponse("Invalid role", 400);
  try {
    const { id } = await params;
    const result = await (await getUsersCollection()).findOneAndUpdate({ _id: id }, { $set: { role: parsed.data.role, updatedAt: new Date() } }, { returnDocument: "after" });
    if (!result) return errorResponse("User not found", 404);
    return NextResponse.json({ id, role: result.role });
  } catch { return errorResponse("Failed to update user role", 500); }
}
