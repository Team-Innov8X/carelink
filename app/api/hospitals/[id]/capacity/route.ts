import { requireRole } from "@/lib/auth-utils";
import clientPromise from "@/lib/mongodb";

const bedCategories = ["general", "icu", "trauma", "ventilators"] as const;
type BedCategory = (typeof bedCategories)[number];

type AppHospital = {
  id: string;
  name: string;
  beds: Partial<Record<BedCategory, { available: number; total: number }>>;
};

type AppStateDocument = {
  _id: string;
  state?: { hospitals?: AppHospital[] };
  revision?: number;
};

export async function PATCH(request: Request, context: RouteContext<"/api/hospitals/[id]/capacity">) {
  const auth = await requireRole(["hospital_staff", "hospital"]);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { id: hospitalId } = await context.params;
  let body: { bedType?: unknown; delta?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!bedCategories.includes(body.bedType as BedCategory) || (body.delta !== 1 && body.delta !== -1)) {
    return Response.json({ error: "bedType and a delta of +1 or -1 are required." }, { status: 400 });
  }

  const bedType = body.bedType as BedCategory;
  const delta = body.delta;
  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  const collection = (await clientPromise).db().collection<AppStateDocument>("appState");

  for (let attempt = 0; attempt < 5; attempt++) {
    const stored = await collection.findOne({ _id: "carelink" });
    const hospital = stored?.state?.hospitals?.find((item) => item.id === hospitalId);
    if (!hospital) return Response.json({ error: "Hospital not found." }, { status: 404 });
    if (process.env.NODE_ENV !== "development" && profile.hospitalId !== hospitalId && profile.hospitalName !== hospital.name) {
      return Response.json({ error: "This hospital belongs to another account." }, { status: 403 });
    }

    const bed = hospital.beds?.[bedType];
    if (!bed || !Number.isInteger(bed.available) || !Number.isInteger(bed.total)) {
      return Response.json({ error: "Bed capacity is not configured." }, { status: 409 });
    }
    const nextAvailable = bed.available + delta;
    if (nextAvailable < 0 || nextAvailable > bed.total) {
      return Response.json({ error: delta < 0 ? "No available beds remain." : "All beds are already available." }, { status: 409 });
    }

    const availablePath = `beds.${bedType}.available`;
    const totalPath = `beds.${bedType}.total`;
    const result = await collection.updateOne(
      {
        _id: "carelink",
        "state.hospitals": { $elemMatch: { id: hospitalId, [availablePath]: bed.available, [totalPath]: bed.total } },
      },
      {
        $inc: { [`state.hospitals.$[hospital].${availablePath}`]: delta, revision: 1 },
        $set: { [`state.hospitals.$[hospital].lastUpdatedMinutesAgo`]: 0, updatedAt: new Date() },
      },
      { arrayFilters: [{ "hospital.id": hospitalId, [`hospital.${availablePath}`]: bed.available, [`hospital.${totalPath}`]: bed.total }] },
    );
    if (result.modifiedCount === 1) {
      return Response.json({ success: true, hospitalId, bedType, available: nextAvailable, total: bed.total });
    }
  }

  return Response.json({ error: "Bed availability changed simultaneously. Refresh and try again." }, { status: 409 });
}
