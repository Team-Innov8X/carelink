import { getDb } from "@/lib/models/db";

export const runtime = "nodejs";

/** Public, aggregate-only counts for the CareLink landing page. */
export async function GET() {
  try {
    const db = await getDb();
    const realAccount = { isDemo: { $ne: true }, role: { $ne: "admin" } };
    const [members, hospitals, pharmacies, drivers] = await Promise.all([
      db.collection("user").countDocuments(realAccount),
      db.collection("hospitals").countDocuments({ isDemo: { $ne: true } }),
      db.collection("pharmacies").countDocuments({ isDemo: { $ne: true } }),
      db.collection("user").countDocuments({ ...realAccount, role: { $in: ["driver", "ambulance_driver"] } }),
    ]);

    return Response.json({ members, hospitals, pharmacies, drivers }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Network statistics are temporarily unavailable." }, { status: 503 });
  }
}
