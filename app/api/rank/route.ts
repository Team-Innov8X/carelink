import { NextResponse } from "next/server";
import { getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import { addTravelTimes, rankHospitals } from "@/lib/ranking";
import { rankRequestSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";
import { requireRole } from "@/lib/auth-utils";
import { expirePendingHolds } from "@/lib/services/hold-service";

export async function POST(request: Request) {
  const auth = await requireRole(["ambulance_driver", "driver", "dispatcher", "patient"]);
  if (!auth.authorized) return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
  let input;
  try { input = rankRequestSchema.safeParse(await request.json()); }
  catch { return errorResponse("Request body must be valid JSON.", 400); }
  if (!input.success) return validationError(input.error);
  try {
    await expirePendingHolds();
    const [hospitalDocuments, resourceDocuments, doctorDocuments] = await Promise.all([
      (await getHospitalsCollection()).find({ status: { $in: ["active", "busy"] } }).toArray(),
      (await getResourcesCollection()).find({ status: { $ne: "unavailable" }, $expr: { $gt: [{ $subtract: [{ $ifNull: ["$availableQuantity", 0] }, { $ifNull: ["$heldQuantity", 0] }] }, 0] } }).toArray(),
      (await (await import("@/lib/models")).getDoctorsCollection()).find({ availability: { $in: ["available", "on_call"] } }).toArray(),
    ]);
    const hospitals = hospitalDocuments.map((hospital) => {
      const hid = hospital._id?.toString() ?? hospital.id ?? hospital.code;
      const matchedResources = resourceDocuments.filter((resource) => resource.hospitalId === (hospital._id?.toString() ?? hospital.id)).map((resource) => ({
        category: resource.category, availableQuantity: Math.max(0, (resource.availableQuantity ?? 0) - (resource.heldQuantity ?? 0)), updatedAt: resource.updatedAt,
      }));
      const matchedDoctors = doctorDocuments.filter((d) => d.hospitalId === hid || d.hospitalId === hospital.code).map((d) => ({
        category: d.specialization, availableQuantity: 1, updatedAt: d.updatedAt,
      }));
      return {
        id: hid,
        name: hospital.name, location: hospital.location, status: hospital.status,
        resources: [...matchedResources, ...matchedDoctors],
        responseRate: hospital.responseRate,
      };
    });
    const withTravelTimes = await addTravelTimes(hospitals, input.data.ambulanceLocation);
    return NextResponse.json({ emergencyType: input.data.emergencyType, ranked: rankHospitals(withTravelTimes, input.data) });
  } catch {
    return errorResponse("Failed to rank hospitals.", 500);
  }
}
