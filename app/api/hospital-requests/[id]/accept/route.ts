import { requireRole } from "@/lib/auth-utils";
import { confirmHold, createHold, releaseHold } from "@/lib/services/hold-service";
import { getResourcesCollection } from "@/lib/models";
import { workflowCollections } from "@/lib/sos";
import clientPromise from "@/lib/mongodb";
import { writeHospitalAudit } from '@/lib/hospital-audit';
import { randomUUID } from 'node:crypto';

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/hospital-requests/[id]/accept">) {
  const auth = await requireRole(["hospital_staff", "hospital"]);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { id } = await context.params;
  const { hospitalRequests, notifications } = await workflowCollections();
  const hospitalRequest = await hospitalRequests.findOne({ _id: id });
  if (!hospitalRequest) return Response.json({ error: "Hospital request not found." }, { status: 404 });

  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  const belongsToHospital = profile.hospitalId
    ? profile.hospitalId === hospitalRequest.hospitalId
    : profile.hospitalName === hospitalRequest.hospitalName;
  if (!belongsToHospital) {
    return Response.json({ error: "This request belongs to another hospital." }, { status: 403 });
  }
  const appStateDb = (await clientPromise).db();
  const hospitalSnapshot = await appStateDb.collection<{ _id: string; state?: { hospitals?: Array<{ id: string; name: string; acceptingRequests?: boolean }> } }>('appState').findOne({ _id: 'carelink' });
  const hospitalState = hospitalSnapshot?.state?.hospitals?.find((item) => item.id === hospitalRequest.hospitalId || item.name?.toLocaleLowerCase() === hospitalRequest.hospitalName?.toLocaleLowerCase());
  if (hospitalState?.acceptingRequests === false) return Response.json({ error: 'This hospital is currently diverted and cannot accept requests.' }, { status: 409 });

  const locked = await hospitalRequests.updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "accepting", updatedAt: new Date(), acceptedByUserId: auth.user.id } },
  );
  if (locked.modifiedCount !== 1) {
    return Response.json({ error: "This request is already being handled or is no longer pending." }, { status: 409 });
  }

  const rejectForNoBeds = async (bedCategory: string) => {
    const rejectedAt = new Date();
    const rejected = await hospitalRequests.updateOne(
      { _id: id, status: "accepting" },
      { $set: { status: "rejected", rejectionReason: "no_bed", updatedAt: rejectedAt } },
    );
    if (rejected.modifiedCount) {
      await writeHospitalAudit({ hospitalId: hospitalRequest.hospitalId, hospitalName: hospitalRequest.hospitalName, actorId: auth.user!.id, actorName: auth.user!.name, action: 'Request rejected · no beds available', entityType: 'request', entityId: id, details: { bedCategory, reason: 'no_bed' }, createdAt: rejectedAt }).catch((error) => console.error('Could not write no-bed rejection audit:', error));
      await notifications.updateOne(
        { _id: `hospital-rejected-${id}` },
        { $setOnInsert: { _id: `hospital-rejected-${id}`, recipientId: hospitalRequest.patientId, type: 'hospital_request_rejected', title: 'Hospital has no suitable bed available', message: `${hospitalRequest.hospitalName} could not accept this request because no ${bedCategory} bed is available. Please continue through the emergency support flow.`, relatedRequestId: hospitalRequest.sosRequestId, createdAt: rejectedAt } },
        { upsert: true },
      ).catch((error) => console.error('Could not notify patient about no-bed rejection:', error));
    }
    return Response.json({ error: `Request rejected: no ${bedCategory} bed is available for this emergency.`, rejectionReason: 'no_bed' }, { status: 409 });
  };

  let holdId: string | undefined;
  try {
    if (hospitalRequest.inventorySource === "app-state" && hospitalRequest.bedCategory) {
      const database = (await clientPromise).db();
      const appState = database.collection<{ _id: string }>("appState");
      const category = hospitalRequest.bedCategory;
      const result = await appState.updateOne(
        {
          _id: "carelink",
          "state.hospitals": { $elemMatch: { id: hospitalRequest.hospitalId, [`beds.${category}.available`]: { $gt: 0 } } },
        },
        {
          $inc: { [`state.hospitals.$[hospital].beds.${category}.available`]: -1 },
          $set: { updatedAt: new Date() },
        },
        { arrayFilters: [{ "hospital.id": hospitalRequest.hospitalId, [`hospital.beds.${category}.available`]: { $gt: 0 } }] },
      );
      if (result.modifiedCount !== 1) {
        const occurredAt = new Date();
        const winner = await hospitalRequests.findOne({ hospitalId: hospitalRequest.hospitalId, bedCategory: category, status: 'accepted', acceptedAt: { $gte: new Date(occurredAt.getTime() - 60_000) } }, { sort: { acceptedAt: -1 } });
        await appStateDb.collection<{ _id: string; hospitalId: string; hospitalName: string; bedCategory: string; winnerRequestId: string; loserRequestId: string; occurredAt: Date }>('hospitalReservationCollisions').insertOne({ _id: randomUUID(), hospitalId: hospitalRequest.hospitalId, hospitalName: hospitalRequest.hospitalName, bedCategory: category, winnerRequestId: winner?._id ?? 'unknown', loserRequestId: id, occurredAt });
        return rejectForNoBeds(category);
      }

      const acceptedAt = new Date();
      const reservationExpiresAt = new Date(acceptedAt.getTime() + 30 * 60_000);
      await hospitalRequests.updateOne(
        { _id: id, status: "accepting" },
        { $set: { status: "accepted", acceptedAt, reservationExpiresAt, updatedAt: acceptedAt } },
      );
      await writeHospitalAudit({ hospitalId: hospitalRequest.hospitalId, hospitalName: hospitalRequest.hospitalName, actorId: auth.user.id, actorName: auth.user.name, action: 'Request accepted · bed reserved', entityType: 'request', entityId: id, details: { bedCategory: category, expiresAt: reservationExpiresAt }, createdAt: acceptedAt });
      await notifications.updateOne(
        { _id: `hospital-accepted-${id}` },
        { $setOnInsert: {
          _id: `hospital-accepted-${id}`,
          recipientId: hospitalRequest.patientId,
          type: "hospital_request_accepted",
          title: "Hospital accepted your emergency request",
          message: `${hospitalRequest.hospitalName} accepted your request and reserved a bed.`,
          relatedRequestId: hospitalRequest.sosRequestId,
          createdAt: acceptedAt,
        } },
        { upsert: true },
      );
      return Response.json({ success: true, request: { id, status: "accepted", acceptedAt, reservationExpiresAt }, message: "Request accepted and a bed reserved for 30 minutes. The patient was notified." });
    }

    const resources = await getResourcesCollection();
    const bedResources = await resources.find({
      hospitalId: hospitalRequest.hospitalId,
      type: "bed",
      status: { $ne: "unavailable" },
      $expr: { $gte: [{ $subtract: ["$availableQuantity", "$heldQuantity"] }, 1] },
    }).toArray();

    let holdResult: Awaited<ReturnType<typeof createHold>> | null = null;
    for (const resource of bedResources) {
      const result = await createHold({
        hospitalId: hospitalRequest.hospitalId,
        resourceType: "bed",
        category: resource.category,
        requestedByUserId: hospitalRequest.patientId,
        patientDetails: {
          name: hospitalRequest.patientName,
          conditionSummary: hospitalRequest.incidentType,
          priority: /critical|cardiac|stroke/i.test(hospitalRequest.incidentType) ? "critical" : "urgent",
        },
        quantity: 1,
        originLocation: [hospitalRequest.location.longitude, hospitalRequest.location.latitude],
        notes: `SOS ${hospitalRequest.sosRequestId} accepted by ${hospitalRequest.hospitalName}`,
      });
      if (result.success && result.hold) {
        holdResult = result;
        holdId = result.hold.id;
        break;
      }
    }

    if (!holdResult || !holdId) {
      return rejectForNoBeds(hospitalRequest.bedCategory || 'suitable');
    }

    const confirmation = await confirmHold(holdId, auth.user.id);
    if (!confirmation.success) throw new Error(confirmation.message);

    const acceptedAt = new Date();
    await hospitalRequests.updateOne(
      { _id: id, status: "accepting" },
      { $set: { status: "accepted", holdId, acceptedAt, updatedAt: acceptedAt } },
    );
    await writeHospitalAudit({ hospitalId: hospitalRequest.hospitalId, hospitalName: hospitalRequest.hospitalName, actorId: auth.user.id, actorName: auth.user.name, action: 'Request accepted · bed reserved', entityType: 'request', entityId: id, details: { holdId }, createdAt: acceptedAt });
    const notificationId = `hospital-accepted-${id}`;
    await notifications.updateOne(
      { _id: notificationId },
      { $setOnInsert: {
        _id: notificationId,
        recipientId: hospitalRequest.patientId,
        type: "hospital_request_accepted",
        title: "Hospital accepted your emergency request",
        message: `${hospitalRequest.hospitalName} accepted your request and reserved a bed.`,
        relatedRequestId: hospitalRequest.sosRequestId,
        createdAt: acceptedAt,
      } },
      { upsert: true },
    );

    return Response.json({ success: true, request: { id, status: "accepted", acceptedAt }, holdId, message: "Request accepted and one bed reserved. The patient was notified." });
  } catch (error) {
    if (holdId) await releaseHold(holdId).catch(() => undefined);
    await hospitalRequests.updateOne({ _id: id, status: "accepting" }, { $set: { status: "pending", updatedAt: new Date() }, $unset: { acceptedByUserId: "" } });
    return Response.json({ error: error instanceof Error ? error.message : "Could not accept the hospital request." }, { status: 500 });
  }
}
