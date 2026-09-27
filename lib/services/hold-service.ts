import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { addTravelTimes, rankHospitals, RankingHospital } from "@/lib/ranking";
import {
  getHospitalsCollection,
  getResourcesCollection,
  getHoldsCollection,
  initializeIndexes,
  IHold,
  IResource,
  IHospital,
  ResourceType,
  ResourceCategory,
  IPatientDetails,
} from "@/lib/models";

export interface ICreateHoldParams {
  hospitalId: string;
  resourceId?: string;
  ambulanceId?: string;
  parentHoldId?: string;
  resourceType: ResourceType;
  category: ResourceCategory;
  requestedByUserId: string;
  patientDetails: IPatientDetails;
  quantity?: number;
  originLocation?: [number, number]; // [longitude, latitude] for proximity ranking
  holdTimeoutMinutes?: number; // Defaults to 15 minutes
  notes?: string;
}

export interface INextRankedHospitalResult {
  hospital: IHospital;
  availableResource: IResource;
  distanceMeters?: number;
  travelTimeMinutes?: number;
  score?: number;
  scoreBreakdown?: import("@/lib/ranking").RankingResult["scoreBreakdown"];
}

/**
 * Creates a hold document using an atomic findOneAndUpdate condition.
 * Prevents double booking: first hold wins; if taken, returns next-ranked hospital.
 */
export async function createHold(params: ICreateHoldParams) {
  await initializeIndexes();
  const resourcesCol = await getResourcesCollection();
  const holdsCol = await getHoldsCollection();
  const quantityToHold = params.quantity ?? 1;
  const timeoutMinutes = params.holdTimeoutMinutes || 15;

  // Atomic reservation check: resource exists at hospital AND availableQuantity - heldQuantity >= quantityToHold
  const resourceId = params.resourceId && ObjectId.isValid(params.resourceId) ? new ObjectId(params.resourceId) : params.resourceId;
  const client = await clientPromise;
  const session = client.startSession();
  let updatedResource: IResource | null = null;
  let holdDoc: IHold | null = null;
  let insertedId: ObjectId | undefined;
  try {
    await session.withTransaction(async () => {
      updatedResource = null;
      holdDoc = null;
      insertedId = undefined;
      updatedResource = await resourcesCol.findOneAndUpdate(
        {
          ...(resourceId ? { _id: resourceId as ObjectId } : {}),
          hospitalId: params.hospitalId,
          type: params.resourceType,
          category: params.category,
          status: { $ne: "unavailable" },
          $expr: { $gte: [{ $subtract: ["$availableQuantity", "$heldQuantity"] }, quantityToHold] },
        },
        { $inc: { heldQuantity: quantityToHold }, $set: { updatedAt: new Date() } },
        { returnDocument: "after", session },
      );
      if (!updatedResource) return;

      holdDoc = {
        hospitalId: params.hospitalId,
        resourceId: updatedResource._id!.toString(),
        ambulanceId: params.ambulanceId,
        parentHoldId: params.parentHoldId,
        requestedByUserId: params.requestedByUserId,
        patientDetails: params.patientDetails,
        quantity: quantityToHold,
        status: "pending",
        expiresAt: new Date(Date.now() + timeoutMinutes * 60 * 1000),
        notes: params.notes,
        originLocation: params.originLocation,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const inserted = await holdsCol.insertOne(holdDoc, { session });
      insertedId = inserted.insertedId;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return { success: false, reason: "DUPLICATE_PENDING" as const, message: "You already have a pending hold for this resource." };
    }
    throw error;
  } finally {
    await session.endSession();
  }

  // If atomic operation failed: resource is not available or just taken by another request
  if (!updatedResource) {
    const nextRanked = await findNextRankedHospital({
      resourceType: params.resourceType,
      category: params.category,
      originLocation: params.originLocation,
      excludeHospitalIds: [params.hospitalId],
      quantityNeeded: quantityToHold,
    });

    return {
      success: false,
      reason: "JUST_TAKEN" as const,
      message: "Resource unavailable or just reserved by another request.",
      nextRankedHospital: nextRanked,
    };
  }

  // Atomic hold lock acquired! Insert pending hold document
  if (!holdDoc || !insertedId) return { success: false, reason: "RESERVATION_FAILED" as const, message: "The hold could not be created." };
  const createdHold = { ...(holdDoc as IHold), _id: insertedId.toString(), id: insertedId.toString() };

  return {
    success: true,
    reason: null,
    message: "Hold successfully acquired and pending hospital confirmation.",
    hold: createdHold,
    resource: updatedResource,
  };
}

/**
 * Hospital confirms the pending hold.
 * Decrements availableQuantity & heldQuantity (resource officially occupied).
 */
export async function confirmHold(holdId: string, confirmedByUserId?: string) {
  const holdsCol = await getHoldsCollection();
  const resourcesCol = await getResourcesCollection();

  const queryId = ObjectId.isValid(holdId) ? new ObjectId(holdId) : holdId;
  const client = await clientPromise;
  const session = client.startSession();
  let result: { success: true; message: string; hold: IHold | null; resource: IResource | null } | { success: false; reason: string; message: string } = {
    success: false, reason: "NOT_FOUND", message: "Hold not found or no longer pending.",
  };
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const hold = await holdsCol.findOneAndUpdate(
        { _id: queryId as ObjectId, status: "pending", expiresAt: { $gt: now } },
        { $set: { status: "confirming", updatedAt: now } },
        { returnDocument: "after", session },
      );
      if (!hold) {
        result = { success: false, reason: "NOT_FOUND", message: "Hold not found, expired, or already handled." };
        return;
      }
      const resourceQueryId = ObjectId.isValid(hold.resourceId) ? new ObjectId(hold.resourceId) : hold.resourceId;
      const resourceUpdate = await resourcesCol.findOneAndUpdate(
        { _id: resourceQueryId as ObjectId, heldQuantity: { $gte: hold.quantity }, availableQuantity: { $gte: hold.quantity } },
        { $inc: { availableQuantity: -hold.quantity, heldQuantity: -hold.quantity }, $set: { updatedAt: now } },
        { returnDocument: "after", session },
      );
      if (!resourceUpdate) throw new Error("HOLD_RESOURCE_CAPACITY_LOST");
      if (resourceUpdate.availableQuantity <= 0) await resourcesCol.updateOne({ _id: resourceQueryId as ObjectId }, { $set: { status: "unavailable", updatedAt: now } }, { session });
      const updatedAt = new Date();
      const purgeAt = new Date(updatedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
      await holdsCol.updateOne(
        { _id: queryId as ObjectId, status: "confirming" },
        { $set: { status: "confirmed", confirmedAt: updatedAt, confirmedByUserId, updatedAt, purgeAt }, $unset: { expiresAt: "" } },
        { session },
      );
      const updatedHold = await holdsCol.findOne({ _id: queryId as ObjectId }, { session });
      result = { success: true, message: "Hold confirmed and resource capacity committed.", hold: updatedHold, resource: resourceUpdate };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "HOLD_RESOURCE_CAPACITY_LOST") return { success: false, reason: "JUST_TAKEN", message: "Reserved capacity is no longer available; the hold remains pending." };
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
}

/**
 * Release/Cancel a hold (hospital declined, timed out, or dispatcher cancelled).
 * Atomically releases held quantity and returns next-ranked hospital for escalation.
 */
export async function releaseHold(
  holdId: string,
  reason: "cancelled" | "expired" | "rejected" = "cancelled",
  originLocation?: [number, number]
) {
  const holdsCol = await getHoldsCollection();
  const resourcesCol = await getResourcesCollection();

  const queryId = ObjectId.isValid(holdId) ? new ObjectId(holdId) : holdId;
  const client = await clientPromise;
  const session = client.startSession();
  const transactionResult: { hold: IHold | null; resource: IResource | null; failure: { success: false; reason: string; message: string } | null } = { hold: null, resource: null, failure: null };
  try {
    await session.withTransaction(async () => {
      transactionResult.hold = null;
      transactionResult.resource = null;
      const claimed = await holdsCol.findOneAndUpdate(
        { _id: queryId as ObjectId, status: "pending" },
        { $set: { status: "releasing", releaseReason: reason, updatedAt: new Date() } },
        { returnDocument: "after", session },
      );
      if (!claimed) {
        const current = await holdsCol.findOne({ _id: queryId as ObjectId }, { session });
        transactionResult.failure = current
          ? { success: false, reason: "ALREADY_RELEASED", message: `Hold is already ${current.status}.` }
          : { success: false, reason: "NOT_FOUND", message: "Hold document not found." };
        return;
      }
      const resourceQueryId = ObjectId.isValid(claimed.resourceId) ? new ObjectId(claimed.resourceId) : claimed.resourceId;
      transactionResult.resource = await resourcesCol.findOneAndUpdate(
        { _id: resourceQueryId as ObjectId, heldQuantity: { $gte: claimed.quantity } },
        { $inc: { heldQuantity: -claimed.quantity }, $set: { updatedAt: new Date() } },
        { returnDocument: "after", session },
      );
      if (!transactionResult.resource) throw new Error("HOLD_RESOURCE_NOT_FOUND");
      const releasedAt = new Date();
      const terminalHold = await holdsCol.findOneAndUpdate(
        { _id: queryId as ObjectId, status: "releasing" },
        { $set: { status: reason, updatedAt: releasedAt, purgeAt: new Date(releasedAt.getTime() + 90 * 24 * 60 * 60 * 1000) }, $unset: { expiresAt: "", releaseReason: "" } },
        { returnDocument: "after", session },
      );
      transactionResult.hold = terminalHold;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "HOLD_RESOURCE_NOT_FOUND") return { success: false, reason: "RESOURCE_NOT_FOUND", message: "Resource capacity could not be released; the hold remains pending." };
    throw error;
  } finally {
    await session.endSession();
  }
  if (transactionResult.failure) return transactionResult.failure;
  const releasedHold = transactionResult.hold;
  const releasedResource = transactionResult.resource;
  if (!releasedHold || !releasedResource) return { success: false, reason: "RELEASE_FAILED", message: "The hold could not be released." };

  // Re-rank and acquire a new hold on rejection or timeout; a bare suggestion
  // would leave the patient without a reserved fallback.
  const currentResource = releasedResource;
  let nextRanked = null;

  if (currentResource) {
    nextRanked = await findNextRankedHospital({
      resourceType: currentResource.type,
      category: currentResource.category,
      originLocation: originLocation ?? releasedHold.originLocation,
      excludeHospitalIds: [releasedHold.hospitalId],
      quantityNeeded: releasedHold.quantity,
    });
  }

  let escalatedHold: unknown = null;
  if (nextRanked && (reason === "rejected" || reason === "expired")) {
    const nextResourceId = nextRanked.availableResource._id?.toString();
    if (nextResourceId) {
      const escalation = await createHold({
        hospitalId: nextRanked.hospital._id?.toString() ?? nextRanked.hospital.id ?? nextRanked.hospital.code,
        resourceId: nextResourceId,
        resourceType: currentResource?.type ?? "bed",
        category: currentResource?.category ?? nextRanked.availableResource.category,
        requestedByUserId: releasedHold.requestedByUserId,
        ambulanceId: releasedHold.ambulanceId,
        patientDetails: releasedHold.patientDetails,
        quantity: releasedHold.quantity,
        originLocation: originLocation ?? releasedHold.originLocation,
        notes: `Escalated from hold ${releasedHold._id?.toString() ?? holdId}`,
        parentHoldId: releasedHold._id?.toString() ?? holdId,
      });
      if (escalation.success && escalation.hold) escalatedHold = escalation.hold;
    }
    await holdsCol.updateOne({ _id: queryId as ObjectId }, { $set: { escalationHoldId: (escalatedHold as { id?: string } | null)?.id, escalationCheckedAt: new Date(), escalationAttempts: 1 } });
  } else {
    await holdsCol.updateOne({ _id: queryId as ObjectId }, { $set: { escalationCheckedAt: new Date(), escalationAttempts: 0 } });
  }

  return {
    success: true,
    message: `Hold successfully ${reason}. Resource released.`,
    releasedHoldId: holdId,
    nextRankedHospital: nextRanked,
    escalatedHold,
  };
}

/** Expire due pending holds, release their inventory, and return rerank candidates. */
export async function expirePendingHolds(hospitalId?: string) {
  const holds = await getHoldsCollection();
  const due = await holds.find({ status: "pending", expiresAt: { $lte: new Date() }, ...(hospitalId ? { hospitalId } : {}) }).sort({ expiresAt: 1 }).limit(100).toArray();
  const results = [];
  for (const hold of due) {
    if (!hold._id) continue;
    results.push(await releaseHold(hold._id.toString(), "expired", hold.originLocation));
  }
  return results;
}

/**
 * Spatial & capacity search for the next-ranked hospital with available resources.
 */
export async function findNextRankedHospital(params: {
  resourceType: ResourceType;
  category: ResourceCategory;
  originLocation?: [number, number]; // [lng, lat]
  excludeHospitalIds?: string[];
  quantityNeeded?: number;
}): Promise<INextRankedHospitalResult | null> {
  // Ensure the geospatial index is in place before the $geoNear aggregation.
  await initializeIndexes();
  const hospitalsCol = await getHospitalsCollection();
  const resourcesCol = await getResourcesCollection();
  const needed = params.quantityNeeded || 1;
  const excludeIds = params.excludeHospitalIds || [];

  // Find resources with available capacity
  const eligibleResources: IResource[] = await resourcesCol
    .find({
      type: params.resourceType,
      category: params.category,
      hospitalId: { $nin: excludeIds },
      $expr: {
        $gte: [{ $subtract: ["$availableQuantity", "$heldQuantity"] }, needed],
      },
    })
    .toArray();

  if (eligibleResources.length === 0) {
    return null;
  }

  const hospitalIds = [...new Set(eligibleResources.map((r) => r.hospitalId))];
  const hospitals = await hospitalsCol.find({
    _id: { $in: hospitalIds.map((id) => ObjectId.isValid(id) ? new ObjectId(id) : new ObjectId(id)) as ObjectId[] },
    status: { $in: ["active", "busy"] },
  }).toArray();
  const candidates: RankingHospital[] = hospitals.map((hospital) => {
    const id = hospital._id?.toString() ?? hospital.id ?? hospital.code;
    return {
      id,
      name: hospital.name,
      location: hospital.location,
      status: hospital.status,
      resources: eligibleResources.filter((resource) => resource.hospitalId === id).map((resource) => ({
        category: resource.category,
        availableQuantity: Math.max(0, resource.availableQuantity - resource.heldQuantity),
        updatedAt: resource.updatedAt,
      })),
    };
  });
  if (params.originLocation) {
    const [longitude, latitude] = params.originLocation;
    const routed = await addTravelTimes(candidates, { latitude, longitude });
    candidates.splice(0, candidates.length, ...routed);
  }
  const ranked = rankHospitals(candidates, {
    emergencyType: String(params.category),
    requiredResources: [String(params.category)],
    ambulanceLocation: params.originLocation ? { latitude: params.originLocation[1], longitude: params.originLocation[0] } : { latitude: 0, longitude: 0 },
  }, { limit: 1 });
  const winner = ranked[0];
  if (!winner) return null;
  const hospital = hospitals.find((candidate) => candidate._id?.toString() === winner.hospitalId);
  const availableResource = eligibleResources.find((resource) => resource.hospitalId === winner.hospitalId);
  if (!hospital || !availableResource) return null;
  return {
    hospital,
    availableResource,
    travelTimeMinutes: winner.travelTimeMinutes ?? undefined,
    score: winner.score,
    scoreBreakdown: winner.scoreBreakdown,
  };
}
