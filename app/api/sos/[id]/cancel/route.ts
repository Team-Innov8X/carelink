import { requireRole } from "@/lib/auth-utils";
import { getHospitalRequestsCollection, sosCollections } from "@/lib/sos";
import { cancelPatientBedHold } from "@/lib/services/hold-service";

export const runtime = "nodejs";

const pickupStages = ["patient_on_board", "en_route_hospital", "arrived_hospital", "handover_complete"] as const;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["patient", "driver", "ambulance_driver"]);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { id } = await context.params;
  const [{ requests, drivers, offers }, hospitalRequests] = await Promise.all([sosCollections(), getHospitalRequestsCollection()]);
  const now = new Date();
  const isPatient = (auth.user as { role?: string }).role === "patient";
  const ownerFilter = isPatient ? { patientId: auth.user.id } : { driverId: auth.user.id };
  const current = await requests.findOne({ _id: id, ...ownerFilter, status: { $in: ["searching", "accepted"] } });
  if (!current) {
    const owned = await requests.findOne({ _id: id, ...ownerFilter }, { projection: { _id: 1 } });
    return Response.json({ error: owned ? "This request is no longer active and cannot be cancelled." : "SOS request not found." }, { status: owned ? 409 : 404 });
  }
  if (isPatient && current.tripStage && pickupStages.includes(current.tripStage as (typeof pickupStages)[number])) {
    return Response.json({ error: "This SOS can no longer be cancelled because pickup has started." }, { status: 409 });
  }
  const previousDispatchStatus = current.dispatchStatus ?? (current.driverId ? "accepted" : "offered");
  const result = await requests.updateOne(
    {
      _id: id,
      ...ownerFilter,
      status: { $in: ["searching", "accepted"] },
      ...(isPatient ? { tripStage: { $nin: pickupStages } } : {}),
    },
    {
      $set: { status: "cancelled", dispatchStatus: "cancelled", cancelledAt: now, cancellationReason: isPatient ? "Cancelled by patient" : "Cancelled by assigned driver", updatedAt: now },
      $unset: { activePatientId: "" },
      $push: { transitionLog: { from: previousDispatchStatus, to: "cancelled", at: now, actor: { type: isPatient ? "patient" : "driver", id: auth.user.id }, reason: isPatient ? "Cancelled by patient" : "Cancelled by assigned driver" } },
    },
  );

  if (result.modifiedCount !== 1) {
    const current = await requests.findOne({ _id: id, ...ownerFilter }, { projection: { status: 1, tripStage: 1 } });
    if (!current) return Response.json({ error: "SOS request not found." }, { status: 404 });
    if (isPatient && current.tripStage && pickupStages.includes(current.tripStage as (typeof pickupStages)[number])) {
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
  await Promise.all((["offered", "pending"] as const).map((from) => offers.updateMany(
    { requestId: id, status: from },
    { $set: { status: "superseded", respondedAt: now }, $push: { transitionLog: { from, to: "superseded", at: now, actor: { type: isPatient ? "patient" : "driver", id: auth.user!.id }, reason: "Request cancelled" } } },
  )));

  return Response.json({ success: true, request: { id, status: "cancelled" } });
}
