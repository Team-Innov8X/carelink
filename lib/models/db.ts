import { Collection, type Document } from "mongodb";
import clientPromise from "../mongodb.ts";
import type { IHospital } from "./hospital.ts";
import type { IResource } from "./resource.ts";
import type { IHold } from "./hold.ts";
import type { IUser } from "./user.ts";
import type { IDoctor } from "./doctor.ts";

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

let notificationRecipientIndexPromise: Promise<void> | null = null;

/** Reconcile the notification recipient index to one stable name. Older code
 * created the same key pattern without a name, which conflicts with the named
 * index created by workflowCollections. */
export function ensureNotificationRecipientIndex<TSchema extends Document>(collection: Collection<TSchema>): Promise<void> {
  if (notificationRecipientIndexPromise) return notificationRecipientIndexPromise;
  notificationRecipientIndexPromise = (async () => {
    const key = { recipientId: 1, createdAt: -1 };
    const indexes = await collection.listIndexes().toArray();
    const existing = indexes.find((index) => {
      const entries = Object.entries(index.key as Record<string, number>);
      return entries.length === 2 && entries[0][0] === "recipientId" && entries[0][1] === 1
        && entries[1][0] === "createdAt" && entries[1][1] === -1;
    });
    if (existing?.name === "notifications_recipient_created") return;
    if (existing?.name) await collection.dropIndex(existing.name);
    await collection.createIndex(key, { name: "notifications_recipient_created" });
  })().catch((error: unknown) => {
    notificationRecipientIndexPromise = null;
    throw error;
  });
  return notificationRecipientIndexPromise;
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
    await hospitals.createIndex({ ownerUserId: 1 }, { sparse: true });
    await (await getDb()).collection("pharmacies").createIndex({ location: "2dsphere" });

    const resources = await getResourcesCollection();
    await resources.createIndex({ hospitalId: 1, type: 1, category: 1, status: 1 });

    const doctors = await getDoctorsCollection();
    await doctors.createIndex({ hospitalId: 1 });

    const notifications = (await getDb()).collection("notifications");
    const notificationTtlHours = Math.max(1, Number(process.env.NOTIFICATION_TTL_HOURS) || 24);
    const notificationIndexes = await notifications.listIndexes().toArray();
    const existingTtlIndex = notificationIndexes.find((index) => (index.key as Record<string, number>)?.createdAt === 1);
    if (existingTtlIndex?.name) {
      await (await getDb()).command({ collMod: "notifications", index: { name: existingTtlIndex.name, expireAfterSeconds: notificationTtlHours * 3600 } });
    } else {
      await notifications.createIndex({ createdAt: 1 }, { expireAfterSeconds: notificationTtlHours * 3600, name: "notifications_ttl" });
    }
    await ensureNotificationRecipientIndex(notifications);
    await notifications.createIndex({ userId: 1, createdAt: -1 });

    const holds = await getHoldsCollection();
    await holds.createIndex({ hospitalId: 1, status: 1 });
    // Expiry must release resource inventory before a hold can disappear.
    await holds.dropIndex("expiresAt_1").catch(() => undefined);
    await holds.createIndex({ expiresAt: 1 });
    await holds.createIndex({ requestedByUserId: 1 });
    await holds.createIndex({ patientId: 1 });
    await holds.createIndex(
      { patientId: 1 },
      { name: "one_confirmed_hold_per_patient", unique: true, partialFilterExpression: { patientId: { $exists: true }, status: "confirmed" } },
    );

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
    try {
      await holds.createIndex({ purgeAt: 1 }, { name: "hold_terminal_ttl", expireAfterSeconds: 0 });
    } catch (e: unknown) {
      console.warn("Notice on holds terminal TTL index:", e);
    }

    console.log("CareLink MongoDB indexes successfully initialized.");
  })().catch((error: unknown) => {
    // Allow a later request to retry after a transient database failure.
    indexesPromise = null;
    throw error;
  });

  return indexesPromise;
}
