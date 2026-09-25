import { Collection } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { IHospital } from "./hospital";
import { IResource } from "./resource";
import { IHold } from "./hold";
import { IUser } from "./user";

export async function getDb() {
  const client = await clientPromise;
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
    await hospitals.createIndex({ location: "2dsphere" }, { name: "hospitals_location_2dsphere" });
    await hospitals.createIndex({ code: 1 }, { unique: true });

    const resources = await getResourcesCollection();
    await resources.createIndex({ hospitalId: 1, type: 1, category: 1, status: 1 });

    const holds = await getHoldsCollection();
    await holds.createIndex({ hospitalId: 1, status: 1 });
    // Holds use a 15-minute lifetime, matching the default hold timeout.
    await holds.createIndex({ createdAt: 1 }, { expireAfterSeconds: 15 * 60 });
    await holds.createIndex({ requestedByUserId: 1 });

    console.log("CareLink MongoDB indexes successfully initialized.");
  })().catch((error: unknown) => {
    // Allow a later request to retry after a transient database failure.
    indexesPromise = null;
    throw error;
  });

  return indexesPromise;
}
