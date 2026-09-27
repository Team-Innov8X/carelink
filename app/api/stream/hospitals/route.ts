import { requireRole } from "@/lib/auth-utils";
import { errorResponse } from "@/lib/api-response";
import { getHoldsCollection, getResourcesCollection } from "@/lib/models";
import { expirePendingHolds } from "@/lib/services/hold-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRole(["hospital", "admin"]);
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  const isAdmin = (auth.user as typeof auth.user & { role?: string }).role === "admin";
  const hospitalId = (auth.user as typeof auth.user & { hospitalId?: string }).hospitalId;
  if (!isAdmin && !hospitalId) return errorResponse("Hospital account is not linked to a hospital", 403);
  let holds;
  let resources;
  try {
    [holds, resources] = await Promise.all([getHoldsCollection(), getResourcesCollection()]);
  } catch { return errorResponse("Hospital event stream unavailable", 503); }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const scope = isAdmin ? [] : [{ $match: { "fullDocument.hospitalId": hospitalId } }];
      const streams = [holds.watch(scope, { fullDocument: "updateLookup" }), resources.watch(scope, { fullDocument: "updateLookup" })];
      const send = (event: string, data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      streams.forEach((stream, index) => stream.on("change", (change) => send(index === 0 ? "hold" : "resource", change)));
      streams.forEach((stream) => stream.on("error", () => send("error", { error: "Change stream disconnected" })));
      send("ready", { connected: true });
      const heartbeat = setInterval(() => {
        send("heartbeat", { at: new Date().toISOString() });
        void expirePendingHolds().then((results) => {
          const escalations = results.filter((result) => result.success).map((result) => ({ holdId: result.releasedHoldId, nextHospital: result.nextRankedHospital }));
          if (escalations.length) send("escalation", { escalations });
        }).catch(() => undefined);
      }, 20_000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        for (const stream of streams) void stream.close().catch(() => undefined);
        try { controller.close(); } catch { /* already closed by the client */ }
      };
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() { /* Request abort closes both MongoDB cursors above. */ },
  });

  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
