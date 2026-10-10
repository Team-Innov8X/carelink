import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { respondToRecommendation } from "@/lib/recommend/production";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["hospital", "hospital_staff"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  const hospitalId = await resolveHospitalId(profile);
  if (!hospitalId) return Response.json({ error: "Your account is not linked to a hospital." }, { status: 403 });
  const { id } = await params;
  let body: { action?: unknown; reason?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Choose accept or reject." }, { status: 400 }); }
  if (body.action !== "accept" && body.action !== "reject") return Response.json({ error: "Choose accept or reject." }, { status: 400 });
  const reasons = ["no_icu_bed", "specialist_unavailable", "diverted", "other"];
  if (body.action === "reject" && (typeof body.reason !== "string" || !reasons.includes(body.reason))) return Response.json({ error: "Choose a rejection reason." }, { status: 400 });
  try {
    const recommendation = await respondToRecommendation(id, hospitalId, auth.user.id, body.action, typeof body.reason === "string" ? body.reason : undefined);
    return Response.json({ recommendation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process this hospital request.";
    return Response.json({ error: message }, { status: message.includes("not found") ? 404 : message.includes("deadline") ? 409 : message === "FORBIDDEN" ? 403 : 400 });
  }
}
