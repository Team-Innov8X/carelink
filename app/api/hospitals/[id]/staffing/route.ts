import { requireRole } from "@/lib/auth-utils";
import clientPromise from "@/lib/mongodb";

type HospitalDocument = { id: string; name: string; specialties?: string[]; specialtyDoctors?: Record<string, number> };
type AppStateDocument = { _id: string; state?: { hospitals?: HospitalDocument[] }; revision?: number };

export async function PATCH(request: Request, context: RouteContext<"/api/hospitals/[id]/staffing">) {
  const auth = await requireRole(["hospital_staff", "hospital"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { id: hospitalId } = await context.params;
  let body: { specialty?: unknown; doctors?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.specialty !== "string" || !body.specialty.trim() || body.specialty.length > 80 || /[.$]/.test(body.specialty) || !Number.isInteger(body.doctors) || (body.doctors as number) < 0) {
    return Response.json({ error: "A specialty and non-negative whole doctor count are required." }, { status: 400 });
  }
  const specialty = body.specialty.trim();
  const doctors = body.doctors as number;
  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  const collection = (await clientPromise).db().collection<AppStateDocument>("appState");
  for (let attempt = 0; attempt < 5; attempt++) {
    const stored = await collection.findOne({ _id: "carelink" });
    const hospital = stored?.state?.hospitals?.find((item) => item.id === hospitalId);
    if (!hospital) return Response.json({ error: "Hospital not found." }, { status: 404 });
    if (process.env.NODE_ENV !== "development" && profile.hospitalId !== hospitalId && profile.hospitalName !== hospital.name) return Response.json({ error: "This hospital belongs to another account." }, { status: 403 });
    const canonicalName = hospital.specialties?.find((item) => item.toLowerCase() === specialty.toLowerCase()) ?? specialty;
    const current = hospital.specialtyDoctors?.[canonicalName];
    const arrayFilters: Record<string, unknown>[] = [{ "hospital.id": hospitalId }];
    if (typeof current === "number") arrayFilters[0][`hospital.specialtyDoctors.${canonicalName}`] = current;
    else arrayFilters[0][`hospital.specialtyDoctors.${canonicalName}`] = { $exists: false };
    const result = await collection.updateOne(
      { _id: "carelink", ...(typeof stored?.revision === "number" ? { revision: stored.revision } : {}) },
      { $set: { [`state.hospitals.$[hospital].specialtyDoctors.${canonicalName}`]: doctors, updatedAt: new Date() }, $addToSet: { "state.hospitals.$[hospital].specialties": canonicalName }, $inc: { revision: 1 } },
      { arrayFilters },
    );
    if (result.modifiedCount === 1) return Response.json({ success: true, hospitalId, specialty: canonicalName, doctors });
  }
  return Response.json({ error: "Doctor availability changed simultaneously. Refresh and try again." }, { status: 409 });
}
