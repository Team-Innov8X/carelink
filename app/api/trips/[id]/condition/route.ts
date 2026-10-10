import { requireRole } from "@/lib/auth-utils";
import { createTripRecommendation } from "@/lib/recommend/production";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["driver", "ambulance_driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await params;
  let body: { conditionId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Choose a configured condition." }, { status: 400 }); }
  if (typeof body.conditionId !== "string") return Response.json({ error: "Choose a configured condition." }, { status: 400 });
  try {
    const recommendation = await createTripRecommendation(auth.user.id, id, body.conditionId);
    return Response.json({ recommendation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare a hospital recommendation.";
    return Response.json({ error: message }, { status: message.includes("Active trip") ? 404 : message.includes("after arriving") ? 409 : 400 });
  }
}
