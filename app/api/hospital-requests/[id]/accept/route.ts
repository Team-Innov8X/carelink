import { requireRole } from "@/lib/auth-utils";
import { confirmHold, createHold, releaseHold } from "@/lib/services/hold-service";
import { getResourcesCollection } from "@/lib/models";
import { chooseRequiredSpecialty, workflowCollections } from "@/lib/sos";
import type { HospitalAdmissionRequest } from "@/lib/sos";
import connectMongo from "@/lib/mongodb";
import { INITIAL_HOSPITALS } from "@/data/mockHospitals";
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
  const foundHospitalRequest = await hospitalRequests.findOne({ _id: id });
  if (!foundHospitalRequest) return Response.json({ error: "Hospital request not found." }, { status: 404 });
  let hospitalRequest = foundHospitalRequest;

  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  const belongsToHospital = (profile.hospitalId && profile.hospitalId === hospitalRequest.hospitalId)
    || (profile.hospitalName && profile.hospitalName === hospitalRequest.hospitalName);
  if (!belongsToHospital) {
    return Response.json({ error: "This request belongs to another hospital." }, { status: 403 });
  }
  const appStateDb = (await connectMongo()).db();
  const hospitalSnapshot = await appStateDb.collection<{ _id: string; state?: { hospitals?: Array<{ id: string; name: string; acceptingRequests?: boolean }> } }>('appState').findOne({ _id: 'carelink' });
  const hospitalState = hospitalSnapshot?.state?.hospitals?.find((item) => item.id === hospitalRequest.hospitalId);
  if (hospitalState?.acceptingRequests === false) return Response.json({ error: 'This hospital is currently diverted and cannot accept requests.' }, { status: 409 });
  if (!hospitalRequest.requiredSpecialty) {
    const specialty = chooseRequiredSpecialty(hospitalRequest.incidentType, hospitalRequest.requiredEquipment, []);
    await hospitalRequests.updateOne({ _id: id, status: "pending", requiredSpecialty: { $exists: false } }, { $set: { requiredSpecialty: specialty, updatedAt: new Date() } });
    hospitalRequest = { ...hospitalRequest, requiredSpecialty: specialty };
  }

  const locked = await hospitalRequests.updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "accepting", updatedAt: new Date(), acceptedByUserId: auth.user.id } },
  );
  if (locked.modifiedCount !== 1) {
    return Response.json({ error: "This request is already being handled or is no longer pending." }, { status: 409 });
  }

  let holdId: string | undefined;
  let doctorHoldId: string | undefined;
  try {
    if (hospitalRequest.inventorySource === "app-state" && hospitalRequest.bedCategory) {
      const database = (await connectMongo()).db();
      const appState = database.collection<{ _id: string }>("appState");
      const category = hospitalRequest.bedCategory;
      const specialty = hospitalRequest.requiredSpecialty;
      if (!specialty) {
        await hospitalRequests.updateOne({ _id: id, status: "accepting" }, { $set: { status: "pending", updatedAt: new Date() }, $unset: { acceptedByUserId: "" } });
        return Response.json({ error: "A required doctor specialty is not configured for this request." }, { status: 409 });
      }
      const defaultDoctors = INITIAL_HOSPITALS.find((hospital) => hospital.id === hospitalRequest.hospitalId)?.specialtyDoctors;
      if (defaultDoctors) {
        await appState.updateOne(
          { _id: "carelink", "state.hospitals": { $elemMatch: { id: hospitalRequest.hospitalId, specialtyDoctors: { $exists: false } } } },
          { $set: { "state.hospitals.$[hospital].specialtyDoctors": defaultDoctors, updatedAt: new Date() }, $inc: { revision: 1 } },
          { arrayFilters: [{ "hospital.id": hospitalRequest.hospitalId, "hospital.specialtyDoctors": { $exists: false } }] },
        );
      }
      const result = await appState.updateOne(
        {
          _id: "carelink",
          "state.hospitals": { $elemMatch: { id: hospitalRequest.hospitalId, [`beds.${category}.available`]: { $gt: 0 }, [`specialtyDoctors.${specialty}`]: { $gt: 0 } } },
        },
        {
          $inc: { [`state.hospitals.$[hospital].beds.${category}.available`]: -1, [`state.hospitals.$[hospital].specialtyDoctors.${specialty}`]: -1, revision: 1 },
          $set: { updatedAt: new Date() },
        },
        { arrayFilters: [{ "hospital.id": hospitalRequest.hospitalId, [`hospital.beds.${category}.available`]: { $gt: 0 }, [`hospital.specialtyDoctors.${specialty}`]: { $gt: 0 } }] },
      );
      if (result.modifiedCount !== 1) {
        await hospitalRequests.updateOne({ _id: id, status: "accepting" }, { $set: { status: "pending", updatedAt: new Date() }, $unset: { acceptedByUserId: "" } });
        const occurredAt = new Date();
        const winner = await hospitalRequests.findOne({ hospitalId: hospitalRequest.hospitalId, bedCategory: category, status: 'accepted', acceptedAt: { $gte: new Date(occurredAt.getTime() - 60_000) } }, { sort: { acceptedAt: -1 } });
        await appStateDb.collection<{ _id: string; hospitalId: string; hospitalName: string; bedCategory: string; winnerRequestId: string; loserRequestId: string; occurredAt: Date }>('hospitalReservationCollisions').insertOne({ _id: randomUUID(), hospitalId: hospitalRequest.hospitalId, hospitalName: hospitalRequest.hospitalName, bedCategory: category, winnerRequestId: winner?._id ?? 'unknown', loserRequestId: id, occurredAt });
        return Response.json({ error: `A ${category} bed and ${specialty} doctor must both be available. The request remains pending.` }, { status: 409 });
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
          message: `${hospitalRequest.hospitalName} accepted your request and reserved a ${category} bed and ${specialty} doctor.`,
          relatedRequestId: hospitalRequest.sosRequestId,
          createdAt: acceptedAt,
        } },
        { upsert: true },
      );
      return Response.json({ success: true, request: { id, status: "accepted", acceptedAt, reservationExpiresAt }, message: "Request accepted; a bed and doctor are reserved for 30 minutes. The patient was notified." });
    }

    const resources = await getResourcesCollection();
    const bedResources = await resources.find({
      hospitalId: hospitalRequest.hospitalId,
      type: "bed",
      ...(hospitalRequest.bedCategory ? { category: hospitalRequest.bedCategory } : {}),
      status: { $ne: "unavailable" },
      $expr: { $gte: [{ $subtract: ["$availableQuantity", "$heldQuantity"] }, 1] },
    }).toArray();

    const doctorCategory = doctorResourceCategory(hospitalRequest);
    if (!doctorCategory) {
      await hospitalRequests.updateOne({ _id: id, status: "accepting" }, { $set: { status: "pending", updatedAt: new Date() }, $unset: { acceptedByUserId: "" } });
      return Response.json({ error: "A doctor specialty must be configured before this request can be accepted." }, { status: 409 });
    }
    const doctorHoldResult = await createHold({
      hospitalId: hospitalRequest.hospitalId,
      resourceType: "specialist",
      category: doctorCategory,
      requestedByUserId: hospitalRequest.patientId,
      patientDetails: { name: hospitalRequest.patientName, conditionSummary: hospitalRequest.incidentType, priority: "urgent" },
      quantity: 1,
      originLocation: [hospitalRequest.location.longitude, hospitalRequest.location.latitude],
      notes: `Doctor for ${hospitalRequest.sosRequestId}`,
    });
    doctorHoldId = doctorHoldResult.success && doctorHoldResult.hold ? doctorHoldResult.hold.id : undefined;
    if (!doctorHoldId) {
      await hospitalRequests.updateOne({ _id: id, status: "accepting" }, { $set: { status: "pending", updatedAt: new Date() }, $unset: { acceptedByUserId: "" } });
      return Response.json({ error: `No ${doctorCategory.replaceAll("_", " ")} is currently available. The request remains pending.` }, { status: 409 });
    }

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
      await releaseHold(doctorHoldId).catch(() => undefined);
      await hospitalRequests.updateOne({ _id: id, status: "accepting" }, { $set: { status: "pending", updatedAt: new Date() }, $unset: { acceptedByUserId: "" } });
      return Response.json({ error: "No bed is currently available at this hospital. The request remains pending." }, { status: 409 });
    }

    const confirmation = await confirmHold(holdId, auth.user.id);
    if (!confirmation.success) throw new Error(confirmation.message);
    const doctorConfirmation = await confirmHold(doctorHoldId, auth.user.id);
    if (!doctorConfirmation.success) throw new Error(doctorConfirmation.message);

    const acceptedAt = new Date();
    await hospitalRequests.updateOne(
      { _id: id, status: "accepting" },
      { $set: { status: "accepted", holdId, doctorHoldId, acceptedAt, updatedAt: acceptedAt } },
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
        message: `${hospitalRequest.hospitalName} accepted your request and reserved a bed and ${doctorCategory.replaceAll("_", " ")}.`,
        relatedRequestId: hospitalRequest.sosRequestId,
        createdAt: acceptedAt,
      } },
      { upsert: true },
    );

    return Response.json({ success: true, request: { id, status: "accepted", acceptedAt }, holdId, message: "Request accepted; a bed and doctor were reserved. The patient was notified." });
  } catch (error) {
    if (holdId) await releaseHold(holdId).catch(() => undefined);
    if (doctorHoldId) await releaseHold(doctorHoldId).catch(() => undefined);
    await hospitalRequests.updateOne({ _id: id, status: "accepting" }, { $set: { status: "pending", updatedAt: new Date() }, $unset: { acceptedByUserId: "" } });
    return Response.json({ error: error instanceof Error ? error.message : "Could not accept the hospital request." }, { status: 500 });
  }
}

function doctorResourceCategory(request: HospitalAdmissionRequest) {
  const specialty = request.requiredSpecialty?.toLowerCase() ?? "";
  if (/cardiac|cardio|heart/.test(specialty)) return "cardiologist";
  if (/neuro|stroke|brain/.test(specialty)) return "neurologist";
  if (/trauma|orthop|injur/.test(specialty)) return "trauma_surgeon";
  if (/icu|critical|anesth/.test(specialty)) return "anesthesiologist";
  if (/pediatric|child/.test(specialty)) return "pediatrician";
  if (/general|emergency/.test(specialty)) return "emergency_physician";
  return undefined;
}
