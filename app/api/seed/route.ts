import { NextResponse } from "next/server";
import { seedDatabase } from "@/scripts/seed/seed-database";
import { requireRole } from "@/lib/auth-utils";
import { errorResponse } from "@/lib/api-response";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    const auth = await requireRole("admin");
    if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  }
  let variant: "demo" | "stale-low" | "verify" = "demo";
  try {
    const body = await request.json() as { variant?: unknown };
    if (body.variant !== undefined) {
      if (body.variant !== "demo" && body.variant !== "stale-low" && body.variant !== "verify") return errorResponse("variant must be demo, stale-low, or verify", 400);
      variant = body.variant;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) return errorResponse("Could not read seed options", 400);
  }
  try {
    return NextResponse.json(await seedDatabase(variant));
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Seeding failed" },
      { status: 500 },
    );
  }
}
