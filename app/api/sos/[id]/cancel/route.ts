import { requireRole } from "@/lib/auth-utils";
import { getHospitalRequestsCollection, sosCollections } from "@/lib/sos";
import { cancelPatientBedHold } from "@/lib/services/hold-service";

export const runtime = "nodejs";

const pickupStages = ["patient_on_board", "en_route_hospital", "arrived_hospital", "handover_complete"] as const;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["patient"]);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { id } = await context.params;
  const [{ requests, drivers }, hospitalRequests] = await Promise.all([sosCollections(), getHospitalRequestsCollection()]);
  const now = new Date();
  const result = await requests.updateOne(
    {
      _id: id,
      patientId: auth.user.id,
      status: { $in: ["searching", "accepted"] },
      tripStage: { $nin: pickupStages },
    },
    { $set: { status: "cancelled", cancelledAt: now, cancellationReason: "Cancelled by patient", updatedAt: now } },
  );

  if (result.modifiedCount !== 1) {
    const current = await requests.findOne({ _id: id, patientId: auth.user.id }, { projection: { status: 1, tripStage: 1 } });
    if (!current) return Response.json({ error: "SOS request not found." }, { status: 404 });
    if (current.tripStage && pickupStages.includes(current.tripStage as (typeof pickupStages)[number])) {
      return Response.json({ error: "This SOS can no longer be cancelled because pickup has started." }, { status: 409 });
    }
    return Response.json({ error: "This SOS is no longer active and cannot be cancelled." }, { status: 409 });
  }

  const [request, linkedHospitalRequest] = await Promise.all([
    requests.findOne({ _id: id }, { projection: { driverId: 1, assignedDriverId: 1 } }),
    hospitalRequests.findOne({ sosRequestId: id }, { projection: { _id: 1, holdId: 1, hospitalId: 1 } }),
  ]);

  const driverId = request?.driverId || request?.assignedDriverId;
  const updates: Promise<unknown>[] = [
    hospitalRequests.updateOne(
      { sosRequestId: id, status: { $in: ["pending", "accepting", "accepted", "expiring", "rerouting"] } },
      { $set: { status: "cancelled", updatedAt: now } },
    ),
  ];
  if (driverId) {
    updates.push(drivers.updateOne(
      { userId: driverId, $or: [{ activeRequestId: id }, { pendingOfferRequestId: id }] },
      { $set: { available: true, availableSince: now, updatedAt: now }, $unset: { activeRequestId: "", pendingOfferRequestId: "", pendingOfferExpiresAt: "" } },
    ));
  }
  if (linkedHospitalRequest?.holdId) {
    updates.push(cancelPatientBedHold(linkedHospitalRequest.holdId, auth.user.id).then((release) => {
      if (!release.success) {
        console.error("Could not release bed hold for cancelled SOS", id, release);
      }
    }));
  }
  await Promise.all(updates);

  return Response.json({ success: true, request: { id, status: "cancelled" } });
}
