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
    const [hospitalDocuments, resourceDocuments] = await Promise.all([
      (await getHospitalsCollection()).find({ status: { $in: ["active", "busy"] } }).toArray(),
      (await getResourcesCollection()).find({ status: { $ne: "unavailable" }, $expr: { $gt: [{ $subtract: [{ $ifNull: ["$availableQuantity", 0] }, { $ifNull: ["$heldQuantity", 0] }] }, 0] } }).toArray(),
    ]);
    const hospitals = hospitalDocuments.map((hospital) => ({
      id: hospital._id?.toString() ?? hospital.id ?? hospital.code,
      name: hospital.name, location: hospital.location, status: hospital.status,
      resources: resourceDocuments.filter((resource) => resource.hospitalId === (hospital._id?.toString() ?? hospital.id)).map((resource) => ({
        category: resource.category, availableQuantity: Math.max(0, (resource.availableQuantity ?? 0) - (resource.heldQuantity ?? 0)), updatedAt: resource.updatedAt,
      })),
      responseRate: hospital.responseRate,
    }));
    const withTravelTimes = await addTravelTimes(hospitals, input.data.ambulanceLocation);
    return NextResponse.json({ emergencyType: input.data.emergencyType, ranked: rankHospitals(withTravelTimes, input.data) });
  } catch {
    return errorResponse("Failed to rank hospitals.", 500);
  }
}
