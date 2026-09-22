import { ObjectId } from "mongodb";
import {
  getHospitalsCollection,
  getResourcesCollection,
  getHoldsCollection,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const insertResult = await holdsCol.insertOne(holdDoc);
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

  // Find hold
  const hold = await holdsCol.findOne({ _id: queryId as any });

  if (!hold) {
    return { success: false, reason: "NOT_FOUND", message: "Hold document not found." };
  }

  if (hold.status !== "pending") {
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
    { _id: resourceQueryId as any },
    {
      $inc: {
        availableQuantity: -hold.quantity,
        heldQuantity: -hold.quantity,
      },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" }
  );

  // Update resource status if availableQuantity reaches 0
  if (resourceUpdate && resourceUpdate.availableQuantity <= 0) {
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
  reason: "cancelled" | "expired" = "cancelled",
  originLocation?: [number, number]
) {
  const holdsCol = await getHoldsCollection();
  const resourcesCol = await getResourcesCollection();

  const queryId = ObjectId.isValid(holdId) ? new ObjectId(holdId) : holdId;
  const hold = await holdsCol.findOne({ _id: queryId as any });

  if (!hold) {
    return { success: false, reason: "NOT_FOUND", message: "Hold document not found." };
  }

  if (hold.status === "cancelled" || hold.status === "expired") {
    return { success: false, reason: "ALREADY_RELEASED", message: `Hold is already ${hold.status}.` };
  }

  const resourceQueryId = ObjectId.isValid(hold.resourceId)
    ? new ObjectId(hold.resourceId)
    : hold.resourceId;

  // Release held quantity if hold was pending
  if (hold.status === "pending") {
    await resourcesCol.updateOne(
      { _id: resourceQueryId as any },
      {
        $inc: { heldQuantity: -hold.quantity },
        $set: { updatedAt: new Date() },
      }
    );
  } else if (hold.status === "confirmed") {
    // If releasing a confirmed hold, restore available quantity
    await resourcesCol.updateOne(
      { _id: resourceQueryId as any },
      {
        $inc: { availableQuantity: hold.quantity },
        $set: { status: "available", updatedAt: new Date() },
      }
    );
  }

  // Update hold document status
  await holdsCol.updateOne(
    { _id: queryId as any },
    {
      $set: {
        status: reason,
        updatedAt: new Date(),
      },
    }
  );

  // Auto-escalate: Find next-ranked hospital for rerouting
  const currentResource = await resourcesCol.findOne({ _id: resourceQueryId as any });
  let nextRanked = null;

  if (currentResource) {
    nextRanked = await findNextRankedHospital({
      resourceType: currentResource.type,
      category: currentResource.category,
      originLocation,
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

  const hospitalIds = eligibleResources.map((r) => r.hospitalId);

  // If origin location is provided, query nearby hospitals using 2DSphere spatial index
  if (params.originLocation && params.originLocation.length === 2) {
    const nearbyHospitals = await hospitalsCol
      .aggregate<IHospital & { dist: { calculated: number } }>([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: params.originLocation,
            },
            distanceField: "dist.calculated",
            spherical: true,
            query: {
              _id: {
                $in: hospitalIds.map((id) =>
                  ObjectId.isValid(id) ? new ObjectId(id) : id
                ),
              },
              status: { $in: ["active", "busy"] },
            },
          },
        },
        { $limit: 1 },
      ])
      .toArray();

    if (nearbyHospitals.length > 0) {
      const topHospital = nearbyHospitals[0];
      const matchingResource = eligibleResources.find(
        (r) => r.hospitalId === String(topHospital._id)
      )!;

      return {
        hospital: topHospital,
        availableResource: matchingResource,
        distanceMeters: Math.round(topHospital.dist.calculated),
      };
    }
  }

  // Fallback: Find active hospital with highest available capacity
  const availableHospital = await hospitalsCol.findOne({
    _id: {
      $in: hospitalIds.map((id) =>
        ObjectId.isValid(id) ? new ObjectId(id) : id
      ) as any,
    },
    status: { $in: ["active", "busy"] },
  });

  if (!availableHospital) {
    return null;
  }

  const matchingResource = eligibleResources.find(
    (r) => r.hospitalId === String(availableHospital._id)
  )!;

  return {
    hospital: availableHospital,
    availableResource: matchingResource,
  };
}
