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

/**
 * Initialize MongoDB Indexes for spatial queries and fast lookups.
 */
export async function initializeIndexes() {
  try {
    const hospitals = await getHospitalsCollection();
    await hospitals.createIndex({ location: "2dsphere" });
    await hospitals.createIndex({ code: 1 }, { unique: true });

    const resources = await getResourcesCollection();
    await resources.createIndex({ hospitalId: 1, type: 1, category: 1 });

    const holds = await getHoldsCollection();
    await holds.createIndex({ hospitalId: 1, status: 1 });
    await holds.createIndex({ expiresAt: 1 });
    await holds.createIndex({ requestedByUserId: 1 });

    console.log("CareLink MongoDB indexes successfully initialized.");
  } catch (error) {
    console.error("Failed to initialize MongoDB indexes:", error);
  }
}
