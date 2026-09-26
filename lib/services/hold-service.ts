import { ObjectId } from "mongodb";
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
  const resourcesCol = await getResourcesCollection();
  const holdsCol = await getHoldsCollection();
  const quantityToHold = params.quantity || 1;
  const timeoutMinutes = params.holdTimeoutMinutes || 15;

  // Atomic reservation check: resource exists at hospital AND availableQuantity - heldQuantity >= quantityToHold
  const updatedResource = await resourcesCol.findOneAndUpdate(
    {
      hospitalId: params.hospitalId,
      type: params.resourceType,
      category: params.category,
      status: { $ne: "unavailable" },
      $expr: {
        $gte: [
          { $subtract: ["$availableQuantity", "$heldQuantity"] },
          quantityToHold,
        ],
      },
    },
    {
      $inc: { heldQuantity: quantityToHold },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" }
  );

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
  const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

  const holdDoc: IHold = {
    hospitalId: params.hospitalId,
    resourceId: updatedResource._id.toString(),
    requestedByUserId: params.requestedByUserId,
    patientDetails: params.patientDetails,
    quantity: quantityToHold,
    status: "pending",
    expiresAt,
    notes: params.notes,
    originLocation: params.originLocation,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let insertResult;
  try {
    insertResult = await holdsCol.insertOne(holdDoc);
  } catch (error) {
    await resourcesCol.updateOne({ _id: updatedResource._id, heldQuantity: { $gte: quantityToHold } }, { $inc: { heldQuantity: -quantityToHold }, $set: { updatedAt: new Date() } });
    throw error;
  }
  const createdHold = { ...holdDoc, _id: insertResult.insertedId.toString(), id: insertResult.insertedId.toString() };

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

  // Claim the pending hold first so simultaneous confirm/reject requests cannot
  // consume or release the same inventory twice.
  const hold = await holdsCol.findOneAndUpdate(
    { _id: queryId as any, status: "pending", expiresAt: { $gt: new Date() } },
    { $set: { status: "confirming", updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!hold) {
    return { success: false, reason: "NOT_FOUND", message: "Hold document not found." };
  }

  if (hold.status !== "confirming") {
    return {
      success: false,
      reason: "INVALID_STATUS",
      message: `Cannot confirm hold with status: ${hold.status}`,
    };
  }

  // Atomically update resource: decrement both availableQuantity and heldQuantity
  const resourceQueryId = ObjectId.isValid(hold.resourceId)
    ? new ObjectId(hold.resourceId)
    : hold.resourceId;

  const resourceUpdate = await resourcesCol.findOneAndUpdate(
    { _id: resourceQueryId as any, availableQuantity: { $gte: hold.quantity }, heldQuantity: { $gte: hold.quantity } },
    {
      $inc: {
        availableQuantity: -hold.quantity,
        heldQuantity: -hold.quantity,
      },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" }
  );

  if (!resourceUpdate) {
    await holdsCol.updateOne({ _id: queryId as any, status: "confirming" }, { $set: { status: "pending", updatedAt: new Date() } });
    return { success: false, reason: "RESOURCE_CHANGED", message: "The held resource is no longer available." };
  }
  if (resourceUpdate.availableQuantity <= 0) {
    await resourcesCol.updateOne(
      { _id: resourceQueryId as any },
      { $set: { status: "unavailable" } }
    );
  }

  // Mark hold as confirmed
  await holdsCol.updateOne(
    { _id: queryId as any },
    {
      $set: {
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedByUserId,
        updatedAt: new Date(),
      },
    }
  );

  const updatedHold = await holdsCol.findOne({ _id: queryId as any });

  return {
    success: true,
    message: "Hold confirmed. Resource marked unavailable.",
    hold: updatedHold,
    resource: resourceUpdate,
  };
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
  const current = await holdsCol.findOne({ _id: queryId as any });

  if (!current) {
    return { success: false, reason: "NOT_FOUND", message: "Hold document not found." };
  }

  const hold = await holdsCol.findOneAndUpdate(
    { _id: queryId as any, status: "pending" },
    { $set: { status: reason, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!hold) {
    return { success: false, reason: "ALREADY_RELEASED", message: `Hold is already ${current.status}.` };
  }

  const resourceQueryId = ObjectId.isValid(hold.resourceId)
    ? new ObjectId(hold.resourceId)
    : hold.resourceId;

  // A pending hold only increases heldQuantity; availableQuantity remains the
  // physical free count until confirmation, so rejecting decrements held only.
  if (current.status === "pending") {
    const releaseResult = await resourcesCol.updateOne(
      { _id: resourceQueryId as any },
      {
        $inc: { heldQuantity: -hold.quantity },
        $set: { updatedAt: new Date() },
      }
    );
    if (releaseResult.matchedCount === 0) {
      await holdsCol.updateOne({ _id: queryId as any, status: reason }, { $set: { status: "pending", updatedAt: new Date() } });
      return { success: false, reason: "RESOURCE_NOT_FOUND", message: "Resource not found." };
    }
  }

  // Auto-escalate: Find next-ranked hospital for rerouting
  const currentResource = await resourcesCol.findOne({ _id: resourceQueryId as any });
  let nextRanked = null;

  if (currentResource) {
    nextRanked = await findNextRankedHospital({
      resourceType: currentResource.type,
      category: currentResource.category,
      originLocation: originLocation ?? hold.originLocation,
      excludeHospitalIds: [hold.hospitalId],
      quantityNeeded: hold.quantity,
    });
  }

  return {
    success: true,
    message: `Hold successfully ${reason}. Resource released.`,
    releasedHoldId: holdId,
    nextRankedHospital: nextRanked,
  };
}

/** Expire due pending holds, release their inventory, and return rerank candidates. */
export async function expirePendingHolds(hospitalId?: string) {
  const holds = await getHoldsCollection();
  const due = await holds.find({ status: "pending", expiresAt: { $lte: new Date() }, ...(hospitalId ? { hospitalId } : {}) }).limit(100).toArray();
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
  const eligibleResources = await resourcesCol
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
    _id: { $in: hospitalIds.map((id) => ObjectId.isValid(id) ? new ObjectId(id) : id) as any },
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
