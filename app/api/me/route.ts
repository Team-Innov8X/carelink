import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-utils";
import { errorResponse } from "@/lib/api-response";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user) return errorResponse("Unauthenticated", 401);
    return NextResponse.json({ user: session.user });
  } catch { return errorResponse("Failed to load session", 500); }
}
