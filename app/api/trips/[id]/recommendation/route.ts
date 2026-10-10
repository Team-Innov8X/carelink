import { requireRole } from "@/lib/auth-utils";
import { getTripRecommendation } from "@/lib/recommend/production";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["driver", "ambulance_driver", "patient"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await params;
  try {
    const recommendation = await getTripRecommendation(id, auth.user.id, (auth.user as { role?: string }).role ?? "patient");
    if (!recommendation) return Response.json({ recommendation: null }, { status: 200 });
    return Response.json({ recommendation, serverTime: new Date().toISOString(), responseSeconds: 3 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load this recommendation.";
    return Response.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 500 });
  }
}
