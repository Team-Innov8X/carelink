import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { getHoldsCollection, getHospitalsCollection } from "@/lib/models";
import { expireTripRecommendation } from "@/lib/recommend/production";
import { sosCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole(["hospital", "hospital_staff"]);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  const hospitalId = await resolveHospitalId(profile);
  if (!hospitalId) return Response.json({ error: "Your account is not linked to a hospital." }, { status: 403 });
  const holds = await getHoldsCollection();
  const pending = await holds.find({ hospitalId, recommendationRequestKey: { $exists: true }, status: "pending" }).sort({ createdAt: 1 }).limit(100).toArray();
  const expired = pending.filter((hold) => hold.recommendationTripId && hold.recommendationResponseDeadline && hold.recommendationResponseDeadline.getTime() <= Date.now());
  await Promise.all(expired.map((hold) => expireTripRecommendation(hold.recommendationTripId!)));
  const active = await holds.find({ hospitalId, recommendationRequestKey: { $exists: true }, status: "pending" }).sort({ createdAt: 1 }).limit(100).toArray();
  const tripIds = [...new Set(active.flatMap((hold) => hold.recommendationTripId ? [hold.recommendationTripId] : []))];
  const { requests } = await sosCollections();
  const trips = tripIds.length ? await requests.find({ _id: { $in: tripIds } }).project({ recommendation: 1, patientName: 1 }).toArray() : [];
  const tripById = new Map(trips.map((trip) => [trip._id, trip]));
  const hospitals = await getHospitalsCollection();
  const hospital = await hospitals.findOne({ _id: ObjectId.isValid(hospitalId) ? new ObjectId(hospitalId) : hospitalId } as never, { projection: { name: 1 } });
  const response = active.map((hold) => {
    const trip = tripById.get(hold.recommendationTripId ?? "");
    const state = trip?.recommendation;
    return {
      id: hold._id?.toString() ?? hold.id, tripId: hold.recommendationTripId, requestId: hold.recommendationRequestKey,
      hospitalId, hospitalName: hospital?.name ?? profile.hospitalName ?? "Hospital", patientName: hold.patientDetails?.name ?? trip?.patientName ?? "Patient",
      condition: hold.patientDetails?.conditionSummary ?? hold.recommendationConditionId ?? "Condition request", conditionId: hold.recommendationConditionId,
      urgency: hold.patientDetails?.priority ?? "standard", etaMinutes: hold.patientDetails?.etaMinutes,
      createdAt: hold.createdAt, responseDeadline: hold.recommendationResponseDeadline,
      timeline: state?.timeline ?? [], status: hold.status,
    };
  });
  return Response.json({ requests: response, serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
import { ObjectId } from "mongodb";
