import { ObjectId } from "mongodb";
import clientPromise from "../mongodb.ts";
import { addTravelTimes, rankHospitals } from "../ranking.ts";
import type { RankingHospital } from "../ranking.ts";
import {
  getHospitalsCollection,
  getResourcesCollection,
  getHoldsCollection,
  getDb,
  initializeIndexes,
} from "../models/index.ts";
import type {
  IHold,
  IResource,
  IHospital,
  ResourceType,
  ResourceCategory,
  IPatientDetails,
} from "../models/index.ts";

export interface ICreateHoldParams {
  hospitalId: string;
  resourceId?: string;
  ambulanceId?: string;
  parentHoldId?: string;
  resourceType: ResourceType;
  category: ResourceCategory;
  requestedByUserId?: string;
  patientDetails?: IPatientDetails;
  quantity?: number;
  originLocation?: [number, number]; // [longitude, latitude] for proximity ranking
  holdTimeoutMinutes?: number; // Defaults to 15 minutes
  notes?: string;
}

export const HOLD_DURATION_MS = 5 * 60 * 1000;

export interface INextRankedHospitalResult {
  hospital: IHospital;
  availableResource: IResource;
  distanceMeters?: number;
  travelTimeMinutes?: number;
  score?: number;
  scoreBreakdown?: import("../ranking.ts").RankingResult["scoreBreakdown"];
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
  const timeoutMinutes = params.holdTimeoutMinutes || HOLD_DURATION_MS / 60_000;

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
      insertedId = inserted.insertedId as unknown as ObjectId;
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

/** Expire due pending holds, release their inventory, and promote next queued requests. */
export async function expirePendingHolds(hospitalId?: string) {
  const holdsCol = await getHoldsCollection();
  const resourcesCol = await getResourcesCollection();
  const now = new Date();
  const due = await holdsCol.find({
    status: "pending",
    expiresAt: { $lte: now },
    ...(hospitalId ? { hospitalId } : {}),
  }).sort({ expiresAt: 1 }).limit(100).toArray();

  const results = [];
  const affectedHospitals = new Set<string>();

  for (const hold of due) {
    if (!hold._id) continue;
    await holdsCol.updateOne(
      { _id: hold._id },
      { $set: { status: "expired", updatedAt: now }, $unset: { expiresAt: "" } },
    );
    await resourcesCol.updateOne(
      { hospitalId: hold.hospitalId, type: "bed" },
      { $inc: { heldQuantity: -1 } },
    );
    results.push({ success: true, releasedHoldId: hold._id.toString(), nextRankedHospital: null });
    if (hold.hospitalId) {
      affectedHospitals.add(hold.hospitalId);
    }
  }

  for (const hid of affectedHospitals) {
    await promoteNext(hid);
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

/**
 * Atomic monotonic sequence generator for hold requests.
 */
export async function getNextSeq(): Promise<number> {
  const db = await getDb();
  const counter = await db.collection("counters").findOneAndUpdate(
    { _id: "holds_seq" as unknown as ObjectId },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return counter?.seq ?? 1;
}

/**
 * Finds or initializes the bed resource for a hospital.
 */
export async function ensureBedResource(hospitalId: string, resourceId?: string): Promise<IResource> {
  const resourcesCol = await getResourcesCollection();
  if (resourceId) {
    const queryId = ObjectId.isValid(resourceId) ? new ObjectId(resourceId) : resourceId;
    const found = await resourcesCol.findOne({
      $or: [{ _id: queryId as ObjectId }, { id: resourceId }],
      hospitalId,
    });
    if (found) return found;
  }

  const existingBed = await resourcesCol.findOne({
    hospitalId,
    type: "bed",
  });
  if (existingBed) return existingBed;

  const hospitalsCol = await getHospitalsCollection();
  const hospQueryId = ObjectId.isValid(hospitalId) ? new ObjectId(hospitalId) : hospitalId;
  const hospital = await hospitalsCol.findOne({
    $or: [{ _id: hospQueryId as ObjectId }, { id: hospitalId }, { code: hospitalId }],
  });

  const totalBeds = hospital?.capacitySummary?.totalBeds || 1;
  const now = new Date();
  const newResource: IResource = {
    hospitalId,
    type: "bed",
    category: "general",
    name: "General Inpatient Bed",
    totalQuantity: totalBeds,
    availableQuantity: totalBeds,
    heldQuantity: 0,
    status: "available",
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await resourcesCol.insertOne(newResource);
  return { ...newResource, _id: inserted.insertedId, id: inserted.insertedId.toString() };
}

/**
 * Request a bed at a hospital:
 * Rule A: One active request (queued, pending, confirmed) per patient per hospital. Return 409 on duplicate.
 * Rule B: Atomic claim (total beds - confirmed - active unexpired pending holds > 0).
 * If bed is available: sets pending with the configured five-minute hold.
 * If no bed free: sets queued with queuePosition.
 */
export async function requestBedHold(params: {
  patientId: string;
  hospitalId: string;
  resourceId?: string;
  notes?: string;
}) {
  await initializeIndexes();
  const holdsCol = await getHoldsCollection();
  const resourcesCol = await getResourcesCollection();
  const { patientId, hospitalId, notes } = params;

  await expirePendingHolds(hospitalId);

  // Rule A: Enforce one active request per patient per hospital
  const existing = await holdsCol.findOne({
    patientId,
    hospitalId,
    status: { $in: ["queued", "pending", "confirmed"] },
  });
  if (existing) {
    return {
      success: false as const,
      duplicate: true,
      status: 409,
      error: "You already have an active request at this hospital.",
    };
  }

  const seq = await getNextSeq();
  const resource = await ensureBedResource(hospitalId, params.resourceId);
  const resourceId = (resource._id?.toString() ?? resource.id)!;
  const resourceQueryId = ObjectId.isValid(resourceId) ? new ObjectId(resourceId) : resourceId;

  // Atomic claim: bed availability is total beds - confirmed - active unexpired pending holds > 0
  const claimed = await resourcesCol.findOneAndUpdate(
    {
      _id: resourceQueryId as ObjectId,
      $expr: {
        $gt: [
          {
            $subtract: [
              "$totalQuantity",
              {
                $add: [
                  { $ifNull: ["$confirmedQuantity", 0] },
                  { $ifNull: ["$heldQuantity", 0] },
                ],
              },
            ],
          },
          0,
        ],
      },
    },
    {
      $inc: { heldQuantity: 1 },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );

  const now = new Date();

  if (claimed) {
    const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS);
    const holdDoc: IHold = {
      patientId,
      requestedByUserId: patientId,
      hospitalId,
      resourceId,
      seq,
      quantity: 1,
      status: "pending",
      expiresAt,
      notes,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const inserted = await holdsCol.insertOne(holdDoc);
      return {
        success: true as const,
        status: "pending" as const,
        hold: { ...holdDoc, _id: inserted.insertedId, id: inserted.insertedId.toString() },
        expiresAt,
      };
    } catch (err: unknown) {
      await resourcesCol.updateOne(
        { _id: resourceQueryId as ObjectId },
        { $inc: { heldQuantity: -1 } },
      );
      if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
        return {
          success: false as const,
          duplicate: true,
          status: 409,
          error: "You already have an active request at this hospital.",
        };
      }
      throw err;
    }
  }

  // Bed unavailable: queue the request
  const activeQueuedCount = await holdsCol.countDocuments({ hospitalId, status: "queued" });
  const queuePosition = activeQueuedCount + 1;
  const holdDoc: IHold = {
    patientId,
    requestedByUserId: patientId,
    hospitalId,
    resourceId,
    seq,
    quantity: 1,
    queuePosition,
    status: "queued",
    notes,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const inserted = await holdsCol.insertOne(holdDoc);
    return {
      success: true as const,
      status: "queued" as const,
      queuePosition,
      hold: { ...holdDoc, _id: inserted.insertedId, id: inserted.insertedId.toString() },
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
      return {
        success: false as const,
        duplicate: true,
        status: 409,
        error: "You already have an active request at this hospital.",
      };
    }
    throw err;
  }
}

/**
 * Atomically promotes the queued hold with lowest seq for this hospital into pending status.
 */
export async function promoteNext(hospitalId: string): Promise<IHold | null> {
  const holdsCol = await getHoldsCollection();
  const resourcesCol = await getResourcesCollection();

  const hasQueued = await holdsCol.findOne({ hospitalId, status: "queued" });
  if (!hasQueued) return null;

  // Atomically claim bed capacity
  const claimed = await resourcesCol.findOneAndUpdate(
    {
      hospitalId,
      type: "bed",
      $expr: {
        $gt: [
          {
            $subtract: [
              "$totalQuantity",
              {
                $add: [
                  { $ifNull: ["$confirmedQuantity", 0] },
                  { $ifNull: ["$heldQuantity", 0] },
                ],
              },
            ],
          },
          0,
        ],
      },
    },
    {
      $inc: { heldQuantity: 1 },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );

  if (!claimed) return null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS);

  const promoted = await holdsCol.findOneAndUpdate(
    {
      hospitalId,
      status: "queued",
    },
    {
      $set: {
        status: "pending",
        expiresAt,
        updatedAt: now,
      },
      $unset: { queuePosition: "" },
    },
    {
      sort: { seq: 1 },
      returnDocument: "after",
    },
  );

  if (!promoted) {
    await resourcesCol.updateOne(
      { _id: claimed._id },
      { $inc: { heldQuantity: -1 } },
    );
    return null;
  }

  return promoted;
}

/**
 * Cancel a bed hold by patient owner and promote the next queued patient.
 */
export async function cancelPatientBedHold(
  holdIdOrParams: string | { holdId: string; patientId: string },
  patientIdArg?: string,
) {
  const holdId = typeof holdIdOrParams === "object" ? holdIdOrParams.holdId : holdIdOrParams;
  const patientId = typeof holdIdOrParams === "object" ? holdIdOrParams.patientId : patientIdArg!;

  const holdsCol = await getHoldsCollection();
  const resourcesCol = await getResourcesCollection();
  const queryId = ObjectId.isValid(holdId) ? new ObjectId(holdId) : holdId;

  const hold = await holdsCol.findOne({
    $or: [{ _id: queryId as ObjectId }, { id: holdId }],
  });
  if (!hold) return { success: false, status: 404, error: "Hold not found" };

  if (hold.patientId !== patientId && hold.requestedByUserId !== patientId) {
    return { success: false, status: 403, error: "Forbidden" };
  }

  if (hold.status === "cancelled" || hold.status === "rejected" || hold.status === "expired") {
    return { success: true, message: `Hold is already ${hold.status}` };
  }

  const wasPending = hold.status === "pending";
  const wasConfirmed = hold.status === "confirmed";
  const now = new Date();

  await holdsCol.updateOne(
    { _id: hold._id },
    {
      $set: { status: "cancelled", updatedAt: now },
      $unset: { expiresAt: "" },
    },
  );

  if (wasPending) {
    await resourcesCol.updateOne(
      { hospitalId: hold.hospitalId, type: "bed" },
      { $inc: { heldQuantity: -(hold.quantity || 1) } },
    );
  } else if (wasConfirmed) {
    await resourcesCol.updateOne(
      { hospitalId: hold.hospitalId, type: "bed", confirmedQuantity: { $gte: hold.quantity || 1 } },
      { $inc: { confirmedQuantity: -(hold.quantity || 1), availableQuantity: hold.quantity || 1 }, $set: { updatedAt: now } },
    );
    await resourcesCol.updateOne(
      { hospitalId: hold.hospitalId, type: "bed", availableQuantity: { $gt: 0 }, status: "unavailable" },
      { $set: { status: "available", updatedAt: now } },
    );
  }

  const promoted = await promoteNext(hold.hospitalId);

  return { success: true, message: "Request cancelled.", promotedHold: promoted };
}

/**
 * Confirm a pending bed hold by hospital staff, enforce Rule C (cancel patient's other active holds
 * across all hospitals and promote their queues).
 */
export async function confirmPatientBedHold(
  holdIdOrParams: string | { holdId: string; hospitalId: string; confirmedByUserId?: string },
  hospitalIdArg?: string,
  confirmedByUserIdArg?: string,
) {
  const holdId = typeof holdIdOrParams === "object" ? holdIdOrParams.holdId : holdIdOrParams;
  const hospitalId = typeof holdIdOrParams === "object" ? holdIdOrParams.hospitalId : hospitalIdArg!;
  const confirmedByUserId = typeof holdIdOrParams === "object" ? holdIdOrParams.confirmedByUserId : confirmedByUserIdArg;

  const holdsCol = await getHoldsCollection();
  const resourcesCol = await getResourcesCollection();
  const queryId = ObjectId.isValid(holdId) ? new ObjectId(holdId) : holdId;

  const hold = await holdsCol.findOne({
    $or: [{ _id: queryId as ObjectId }, { id: holdId }],
    hospitalId,
    status: "pending",
  });
  if (!hold) return { success: false, status: 404, error: "Pending hold not found for this hospital" };

  const now = new Date();
  await holdsCol.updateOne(
    { _id: hold._id },
    {
      $set: {
        status: "confirmed",
        confirmedAt: now,
        confirmedByUserId,
        updatedAt: now,
      },
      $unset: { expiresAt: "" },
    },
  );

  await resourcesCol.updateOne(
    { hospitalId: hold.hospitalId, type: "bed" },
    {
      $inc: { heldQuantity: -1, confirmedQuantity: 1 },
      $set: { updatedAt: now },
    },
  );

  // Rule C: cancel patient's other active requests across all hospitals and promote their queues
  if (hold.patientId) {
    const otherActive = await holdsCol.find({
      patientId: hold.patientId,
      _id: { $ne: hold._id },
      status: { $in: ["queued", "pending"] },
    }).toArray();

    for (const other of otherActive) {
      if (other.status === "pending") {
        await resourcesCol.updateOne(
          { hospitalId: other.hospitalId, type: "bed" },
          { $inc: { heldQuantity: -1 } },
        );
      }
      await holdsCol.updateOne(
        { _id: other._id },
        {
          $set: { status: "cancelled", updatedAt: now },
          $unset: { expiresAt: "" },
        },
      );
      await promoteNext(other.hospitalId);
    }
  }

  const updatedHold = await holdsCol.findOne({ _id: hold._id });
  return { success: true, hold: updatedHold };
}

/**
 * Reject a pending bed hold by hospital staff and promote next in queue.
 */
export async function rejectPatientBedHold(
  holdIdOrParams: string | { holdId: string; hospitalId: string },
  hospitalIdArg?: string,
) {
  const holdId = typeof holdIdOrParams === "object" ? holdIdOrParams.holdId : holdIdOrParams;
  const hospitalId = typeof holdIdOrParams === "object" ? holdIdOrParams.hospitalId : hospitalIdArg!;

  const holdsCol = await getHoldsCollection();
  const resourcesCol = await getResourcesCollection();
  const queryId = ObjectId.isValid(holdId) ? new ObjectId(holdId) : holdId;

  const hold = await holdsCol.findOne({
    $or: [{ _id: queryId as ObjectId }, { id: holdId }],
    hospitalId,
    status: "pending",
  });
  if (!hold) return { success: false, status: 404, error: "Pending hold not found for this hospital" };

  const now = new Date();
  await holdsCol.updateOne(
    { _id: hold._id },
    {
      $set: { status: "rejected", updatedAt: now },
      $unset: { expiresAt: "" },
    },
  );

  await resourcesCol.updateOne(
    { hospitalId: hold.hospitalId, type: "bed" },
    { $inc: { heldQuantity: -1 } },
  );

  const promoted = await promoteNext(hospitalId);

  return { success: true, message: "Request rejected.", promotedHold: promoted };
}

/**
 * Fetch patient's bed holds across hospitals with live queue positions.
 */
export async function getPatientBedHolds(patientId: string) {
  await initializeIndexes();
  await expirePendingHolds();
  const holdsCol = await getHoldsCollection();
  const hospitalsCol = await getHospitalsCollection();

  const list = await holdsCol.find({
    $or: [{ patientId }, { requestedByUserId: patientId }],
  }).sort({ createdAt: -1 }).toArray();

  const hospitals = await hospitalsCol.find({}).toArray();
  const hospitalMap = new Map<string, string>();
  for (const h of hospitals) {
    const hid = (h._id?.toString() ?? h.id ?? h.code)!;
    hospitalMap.set(hid, h.name);
    if (h.code) hospitalMap.set(h.code, h.name);
  }

  const enriched = await Promise.all(list.map(async (h) => {
    let queuePosition = h.queuePosition;
    if (h.status === "queued" && typeof h.seq === "number") {
      queuePosition = await holdsCol.countDocuments({
        hospitalId: h.hospitalId,
        status: "queued",
        seq: { $lte: h.seq },
      });
    }

    const hospitalName = hospitalMap.get(h.hospitalId) || `Hospital ${h.hospitalId.slice(0, 8)}`;
    return {
      ...h,
      id: h._id?.toString() ?? h.id,
      hospitalName,
      queuePosition,
    };
  }));

  return enriched;
}

/**
 * Fetch pending bed requests for a hospital with remaining seconds countdown and queue length.
 */
export async function getHospitalPendingBedHolds(hospitalId: string) {
  await initializeIndexes();
  await expirePendingHolds(hospitalId);
  const holdsCol = await getHoldsCollection();
  const now = new Date();

  const pendingHolds = await holdsCol.find({
    hospitalId,
    status: "pending",
    expiresAt: { $gt: now },
  }).sort({ createdAt: 1 }).toArray();

  const queueLength = await holdsCol.countDocuments({
    hospitalId,
    status: "queued",
  });

  const formattedHolds = pendingHolds.map((h) => {
    const secondsRemaining = h.expiresAt
      ? Math.max(0, Math.floor((new Date(h.expiresAt).getTime() - Date.now()) / 1000))
      : Math.floor(HOLD_DURATION_MS / 1000);
    return {
      ...h,
      id: h._id?.toString() ?? h.id,
      secondsRemaining,
    };
  });

  return {
    holds: formattedHolds,
    queueLength,
  };
}

