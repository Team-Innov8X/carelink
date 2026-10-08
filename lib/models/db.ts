import { Collection } from "mongodb";
import connectMongo from "@/lib/mongodb";
import { IHospital } from "./hospital";
import { IResource } from "./resource";
import { IHold } from "./hold";
import { IUser } from "./user";
import { IDoctor } from "./doctor";

export async function getDb() {
  const client = await connectMongo();
  return client.db();
}

export async function getHospitalsCollection(): Promise<Collection<IHospital>> {
  const db = await getDb();
  return db.collection<IHospital>("hospitals");
}

export async function getResourcesCollection(): Promise<Collection<IResource>> {
  const db = await getDb();
  return db.collection<IResource>("resources");
}

export async function getDoctorsCollection(): Promise<Collection<IDoctor>> {
  const db = await getDb();
  return db.collection<IDoctor>("doctors");
}

export async function getHoldsCollection(): Promise<Collection<IHold>> {
  const db = await getDb();
  return db.collection<IHold>("holds");
}

export async function getUsersCollection(): Promise<Collection<IUser>> {
  const db = await getDb();
  return db.collection<IUser>("user"); // Uses Better Auth 'user' collection
}

let indexesPromise: Promise<void> | null = null;

/**
 * Ensure MongoDB indexes exist before any query relies on them. In particular,
 * hospitals.location must be GeoJSON Point data for the 2dsphere index and
 * $geoNear queries to work efficiently.
 */
export function initializeIndexes(): Promise<void> {
  if (indexesPromise) return indexesPromise;

  indexesPromise = (async () => {
    const hospitals = await getHospitalsCollection();
    await hospitals.createIndex({ location: "2dsphere" });
    await hospitals.createIndex({ code: 1 }, { unique: true });
    await hospitals.createIndex({ placeId: 1 }, { sparse: true });

    const resources = await getResourcesCollection();
    await resources.createIndex({ hospitalId: 1, type: 1, category: 1, status: 1 });

    const doctors = await getDoctorsCollection();
    await doctors.createIndex({ hospitalId: 1 });

    const holds = await getHoldsCollection();
    await holds.createIndex({ hospitalId: 1, status: 1 });
    await holds.createIndex({ expiresAt: 1 });
    await holds.createIndex({ requestedByUserId: 1 });
    await holds.createIndex({ patientId: 1 });

    // Partial unique index enforcing one active request per patient per hospital
    try {
      await holds.createIndex(
        { patientId: 1, hospitalId: 1 },
        {
          name: "unique_active_hold_per_patient_hospital",
          unique: true,
          partialFilterExpression: { status: { $in: ["queued", "pending", "confirmed"] } },
        },
      );
    } catch (e: unknown) {
      // If index already exists with a different name or options, catch gracefully
      console.warn("Notice on holds unique_active_hold_per_patient_hospital index creation:", e);
    }

    // Index on { hospitalId, status, seq } for queue lookups
    try {
      await holds.createIndex(
        { hospitalId: 1, status: 1, seq: 1 },
        { name: "holds_queue_lookup" },
      );
    } catch (e: unknown) {
      console.warn("Notice on holds queue lookup index creation:", e);
    }

    // The resource's heldQuantity is the cross-request capacity lock. This
    // index prevents the same requester from creating duplicate pending holds
    // on the same resource while still allowing multiple units to be held by
    // different requests when capacity exists.
    try {
      await holds.createIndex(
        { resourceId: 1, requestedByUserId: 1 },
        { name: "one_pending_hold_per_requester_resource", unique: true, partialFilterExpression: { status: "pending" } },
      );
    } catch (e: unknown) {
      console.warn("Notice on holds requester resource index:", e);
    }

    // Keep terminal holds for audit and let MongoDB remove them after 90 days.
    // Pending expiry is handled by the expiry worker so it can release the
    // resource lock before any hold document is removed.
    await holds.createIndex({ purgeAt: 1 }, { name: "hold_terminal_ttl", expireAfterSeconds: 0, sparse: true });

    console.log("CareLink MongoDB indexes successfully initialized.");
  })().catch((error: unknown) => {
    // Allow a later request to retry after a transient database failure.
    indexesPromise = null;
    throw error;
  });

  return indexesPromise;
}
