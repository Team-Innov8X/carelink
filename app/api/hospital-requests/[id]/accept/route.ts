import { requireRole } from "@/lib/auth-utils";
import { confirmHold, createHold, releaseHold } from "@/lib/services/hold-service";
import { getResourcesCollection } from "@/lib/models";
import { workflowCollections } from "@/lib/sos";
import clientPromise from "@/lib/mongodb";

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
  if (process.env.NODE_ENV !== "development" && !belongsToHospital) {
    return Response.json({ error: "This request belongs to another hospital." }, { status: 403 });
  }

  const locked = await hospitalRequests.updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "accepting", updatedAt: new Date(), acceptedByUserId: auth.user.id } },
  );
  if (locked.modifiedCount !== 1) {
    return Response.json({ error: "This request is already being handled or is no longer pending." }, { status: 409 });
  }

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
        await hospitalRequests.updateOne({ _id: id, status: "accepting" }, { $set: { status: "pending", updatedAt: new Date() }, $unset: { acceptedByUserId: "" } });
        return Response.json({ error: "No bed of the required type is currently available. The request remains pending." }, { status: 409 });
      }

      const acceptedAt = new Date();
      await hospitalRequests.updateOne(
        { _id: id, status: "accepting" },
        { $set: { status: "accepted", acceptedAt, updatedAt: acceptedAt } },
      );
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
      return Response.json({ success: true, request: { id, status: "accepted", acceptedAt }, message: "Request accepted and a bed reserved. The patient was notified." });
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
      await hospitalRequests.updateOne({ _id: id, status: "accepting" }, { $set: { status: "pending", updatedAt: new Date() }, $unset: { acceptedByUserId: "" } });
      return Response.json({ error: "No bed is currently available at this hospital. The request remains pending." }, { status: 409 });
    }

    const confirmation = await confirmHold(holdId, auth.user.id);
    if (!confirmation.success) throw new Error(confirmation.message);

    const acceptedAt = new Date();
    await hospitalRequests.updateOne(
      { _id: id, status: "accepting" },
      { $set: { status: "accepted", holdId, acceptedAt, updatedAt: acceptedAt } },
    );
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
