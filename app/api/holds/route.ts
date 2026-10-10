import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { createBedRequest } from "@/lib/holds";
import { initializeIndexes } from "@/lib/models/db";

export async function POST(request: Request) {
  const auth = await requireRole("patient");
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const data = body as { hospitalId?: unknown; patientDetails?: unknown };
  const details = data?.patientDetails as Record<string, unknown> | undefined;
  const validDetails = details === undefined || (
    typeof details === "object" && details !== null && !Array.isArray(details) &&
    (details.name === undefined || typeof details.name === "string") &&
    (details.age === undefined || (typeof details.age === "number" && Number.isInteger(details.age) && details.age > 0)) &&
    (details.gender === undefined || typeof details.gender === "string") &&
    (details.conditionSummary === undefined || typeof details.conditionSummary === "string") &&
    (details.etaMinutes === undefined || (typeof details.etaMinutes === "number" && details.etaMinutes >= 0)) &&
    (details.priority === undefined || ["critical", "urgent", "standard"].includes(String(details.priority)))
  );
  if (typeof data?.hospitalId !== "string" || !data.hospitalId.trim() || !validDetails) {
    return NextResponse.json({ error: "hospitalId and an optional patientDetails object are required" }, { status: 400 });
  }
  try {
    await initializeIndexes();
    const result = await createBedRequest({ hospitalId: data.hospitalId.trim(), patientId: auth.user!.id, patientDetails: data.patientDetails as never });
    if (result.error) return NextResponse.json({ error: "Hospital not found" }, { status: 404 });
    return NextResponse.json(result.hold, { status: 201 });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return NextResponse.json({ error: "An active request already exists for this hospital", code: "ACTIVE_REQUEST_EXISTS" }, { status: 409 });
    console.error("Failed to create bed request", error);
    return NextResponse.json({ error: "Unable to create request" }, { status: 500 });
  }
}

