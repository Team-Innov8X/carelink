import { requireRole } from "@/lib/auth-utils";
import { overrideTripHospital } from "@/lib/recommend/production";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["driver", "ambulance_driver"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await params;
  let body: { hospitalId?: unknown; reason?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Choose a hospital and provide an override reason." }, { status: 400 }); }
  if (typeof body.hospitalId !== "string" || typeof body.reason !== "string" || !body.reason.trim()) return Response.json({ error: "Choose a hospital and provide an override reason." }, { status: 400 });
  try {
    const recommendation = await overrideTripHospital(auth.user.id, id, body.hospitalId, body.reason);
    return Response.json({ recommendation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send the hospital request.";
    return Response.json({ error: message }, { status: message.includes("not feasible") ? 422 : 400 });
  }
}
