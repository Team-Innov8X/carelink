import { requireRole } from "@/lib/auth-utils";
import { getDb } from "@/lib/models/db";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole(["dispatcher", "admin", "hospital"]);
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const db = await getDb();
  const windowMs = Math.max(10_000, Number(process.env.DRIVER_ACTIVE_WINDOW_MS) || 30_000);
  const cutoff = new Date(Date.now() - windowMs);
  const [hospitals, users, active] = await Promise.all([
    db.collection("hospitals").aggregate([{ $group: { _id: { $eq: ["$isDemo", true] }, count: { $sum: 1 } } }]).toArray(),
    db.collection("user").countDocuments({ role: { $in: ["driver", "ambulance_driver"] } }),
    db.collection("drivers").countDocuments({ available: true, locationUpdatedAt: { $gte: cutoff } }),
  ]);
  const counts = new Map(hospitals.map((row) => [String(row._id), row.count as number]));
  return Response.json({ hospitals: { registered: counts.get("false") ?? 0, demo: counts.get("true") ?? 0 }, drivers: { total: users, active } }, { headers: { "Cache-Control": "no-store" } });
}
