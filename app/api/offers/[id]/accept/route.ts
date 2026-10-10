import { sosCollections } from "@/lib/sos";
import { requireRole } from "@/lib/auth-utils";
import { POST as acceptRequest } from "../../../sos/[id]/accept/route";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["ambulance_driver", "driver"]);
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id } = await context.params;
  const { offers } = await sosCollections();
  const offer = await offers.findOne({ _id: id });
  if (!offer) return Response.json({ error: "Offer not found." }, { status: 404 });
  return acceptRequest(request, { params: Promise.resolve({ id: offer.requestId }) });
}
