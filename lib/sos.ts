import { randomUUID } from "node:crypto";
import type { Document } from "mongodb";
import clientPromise from "./mongodb.ts";

export type Coordinates = { latitude: number; longitude: number };

export type SosRequest = {
  _id: string;
  patientId: string;
  patientName: string;
  passengerName?: string;
  patientEmail?: string;
  patientPhone?: string;
  location: Coordinates;
  incidentType: string;
  requestType?: 'emergency' | 'routine';
  preferredTime?: string;
  notes?: string;
  requiredEquipment: string[];
  status: "searching" | "accepted" | "completed" | "cancelled" | "no_driver_found";
  driverId: string | null;
  rejectedDriverIds?: string[];
  createdAt: Date;
  acceptedAt?: Date;
  arrivedAt?: Date;
  tripStage?: 'accepted' | 'arrived_patient' | 'patient_on_board' | 'en_route_hospital' | 'arrived_hospital' | 'handover_complete';
  tripTimestamps?: Record<string, Date>;
  vitalsUpdate?: { bp: string; heartRate: number; spO2: number; updatedAt: Date };
  issue?: { message: string; updatedAt: Date; etaDelayMinutes?: number };
  driverResponses?: { driverId: string; reason?: string; rejectedAt: Date }[];
  assignedDriverId?: string;
  assignmentExpiresAt?: Date;
  assignmentOfferedAt?: Date;
  completedAt?: Date;
  dispatchRound?: number;
  noDriverFoundAt?: Date;
};

export const DISPATCH_BATCH_SIZE = Math.max(1, Number(process.env.DISPATCH_BATCH_SIZE) || 3);
export const OFFER_DURATION_MS = Math.max(1000, Number(process.env.OFFER_DURATION_MS) || 10_000);
export const DISPATCH_MAX_ROUNDS = Math.max(1, Number(process.env.DISPATCH_MAX_ROUNDS) || 3);
const DISPATCH_BASE_RADIUS_KM = Math.max(1, Number(process.env.DISPATCH_RADIUS_KM) || 10);

export type DispatchOffer = { _id: string; requestId: string; driverId: string; round: number; createdAt: Date; expiresAt: Date; status: "offered" | "accepted" | "rejected" | "expired" | "taken" };

export type HospitalAdmissionRequest = {
  _id: string;
  sosRequestId: string;
  hospitalId: string;
  hospitalName: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  location: Coordinates;
  incidentType: string;
  requiredEquipment: string[];
  status: "pending" | "accepting" | "accepted" | "expiring" | "rerouting" | "rejected" | "cancelled";
  requestType?: "sos" | "bed";
  inventorySource?: "app-state";
  bedCategory?: "general" | "icu" | "trauma" | "ventilators";
  holdId?: string;
  acceptedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date;
  reservationExpiresAt?: Date;
  rejectionReason?: 'no_bed' | 'no_icu_bed' | 'specialist_unavailable' | 'diverted' | 'other' | 'reservation_timeout';
  reroutedHospitalIds?: string[];
  reroutedToRequestId?: string;
  reroutedHospitalName?: string;
  driverTripStage?: string;
  driverTripUpdatedAt?: Date;
  driverVitalsUpdate?: { bp: string; heartRate: number; spO2: number; updatedAt: Date };
  driverIssue?: { message: string; updatedAt: Date; etaDelayMinutes?: number };
};

export type HospitalAdmission = {
  _id: string;
  hospitalRequestId: string;
  hospitalId: string;
  hospitalName: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  incidentType: string;
  bedCategory?: HospitalAdmissionRequest['bedCategory'];
  inventorySource?: HospitalAdmissionRequest['inventorySource'];
  holdId?: string;
  admittedAt: Date;
  dischargedAt?: Date;
};

export async function ensureHospitalRequestForSos(sos: SosRequest) {
  const db = (await clientPromise).db();
  const appStateCollection = db.collection<{ _id: string; state?: { hospitals?: Array<Record<string, unknown>> } }>("appState");
  const appState = process.env.NODE_ENV === "development"
    ? await appStateCollection.findOne({ _id: "carelink" })
    : null;
  const demoHospitals = (appState?.state?.hospitals ?? []) as Array<Record<string, unknown>>;
  const nearbyDemo = demoHospitals.flatMap((hospital) => {
    const location = hospital.location as { lat?: unknown; lng?: unknown } | undefined;
    if (typeof location?.lat !== "number" || typeof location.lng !== "number") return [];
    return [{ hospital, distance: distanceKm(sos.location, { latitude: location.lat, longitude: location.lng }) }];
  }).sort((a, b) => a.distance - b.distance)[0];

  const { hospitals } = await sosCollections();
  const { hospitalRequests } = await workflowCollections();
  const existing = await hospitalRequests.findOne({ sosRequestId: sos._id });
  if (existing) {
    if (existing.status === "pending" && nearbyDemo && existing.inventorySource !== "app-state") {
      const hospitalId = String(nearbyDemo.hospital.id ?? "");
      const hospitalName = String(nearbyDemo.hospital.name ?? "");
      if (hospitalId && hospitalName) {
        await hospitalRequests.updateOne({ _id: existing._id, status: "pending" }, { $set: {
          hospitalId,
          hospitalName,
          inventorySource: "app-state",
          bedCategory: chooseBedCategory(sos.requiredEquipment, nearbyDemo.hospital.beds),
          updatedAt: new Date(),
        } });
        return { ...existing, hospitalId, hospitalName, inventorySource: "app-state" as const };
      }
    }
    return existing;
  }

  if (nearbyDemo) {
    const hospitalId = String(nearbyDemo.hospital.id ?? "");
    const hospitalName = String(nearbyDemo.hospital.name ?? "");
    if (hospitalId && hospitalName) {
      const now = new Date();
      const request: HospitalAdmissionRequest = {
        _id: createRequestId(),
        sosRequestId: sos._id,
        requestType: "sos",
        inventorySource: "app-state",
        bedCategory: chooseBedCategory(sos.requiredEquipment, nearbyDemo.hospital.beds),
        hospitalId,
        hospitalName,
        patientId: sos.patientId,
        patientName: sos.patientName,
        patientPhone: sos.patientPhone,
        location: sos.location,
        incidentType: sos.incidentType,
        requiredEquipment: sos.requiredEquipment,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      await hospitalRequests.insertOne(request);
      return request;
    }
  }

  const candidates = await hospitals.find({ status: { $ne: "inactive" } }).toArray();
  const nearest = candidates.flatMap((hospital) => {
    const raw = hospital.location as unknown as { latitude?: unknown; longitude?: unknown; coordinates?: unknown };
    const point = typeof raw?.latitude === "number" && typeof raw.longitude === "number"
      ? { latitude: raw.latitude, longitude: raw.longitude }
      : Array.isArray(raw?.coordinates) && typeof raw.coordinates[0] === "number" && typeof raw.coordinates[1] === "number"
        ? { latitude: raw.coordinates[1], longitude: raw.coordinates[0] }
        : null;
    return point ? [{ hospital, distance: distanceKm(sos.location, point) }] : [];
  }).sort((a, b) => a.distance - b.distance)[0];
  if (!nearest) return null;

  const now = new Date();
  const request: HospitalAdmissionRequest = {
    _id: createRequestId(),
    sosRequestId: sos._id,
    requestType: "sos",
    hospitalId: String(nearest.hospital._id),
    hospitalName: nearest.hospital.name,
    patientId: sos.patientId,
    patientName: sos.patientName,
    patientPhone: sos.patientPhone,
    location: sos.location,
    incidentType: sos.incidentType,
    requiredEquipment: sos.requiredEquipment,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await hospitalRequests.insertOne(request);
  return request;
}

export function chooseBedCategory(
  requiredEquipment: string[],
  bedsValue: unknown,
): HospitalAdmissionRequest["bedCategory"] {
  const beds = bedsValue && typeof bedsValue === "object" ? bedsValue as Record<string, { available?: unknown }> : {};
  const needs = requiredEquipment.join(" ").toLowerCase();
  const preference: NonNullable<HospitalAdmissionRequest["bedCategory"]>[] = /trauma|orthopedic/.test(needs)
    ? ["trauma", "icu", "general"]
    : /icu|cardiac|ventilat|critical/.test(needs)
      ? ["icu", "general", "trauma"]
      : ["general", "icu", "trauma"];
  return preference.find((category) => typeof beds[category]?.available === "number" && beds[category].available > 0)
    ?? preference[0];
}

export type CareNotification = {
  _id: string;
  recipientId: string;
  type: "hospital_request_pending" | "hospital_request_accepted" | "hospital_request_rejected" | "hospital_patient_admitted" | "hospital_request_rerouted" | "hospital_data_stale";
  title: string;
  message: string;
  relatedRequestId: string;
  readAt?: Date;
  createdAt: Date;
};

let sosIndexesPromise: Promise<void> | undefined;
export async function sosCollections() {
  const db = (await clientPromise).db();
  const requests = db.collection<SosRequest>("sosRequests");
  const drivers = db.collection<Document & { userId: string; available: boolean; location?: Coordinates }>("drivers");
  const offers = db.collection<DispatchOffer>("dispatch_offers");
  const hospitals = db.collection<Document & { name: string; location: Coordinates; equipment: string[] }>("hospitals");
  sosIndexesPromise ??= Promise.all([
    requests.createIndex({ patientId: 1, status: 1, createdAt: -1 }, { name: 'sos_patient_status_created' }),
    requests.createIndex({ status: 1, createdAt: -1 }, { name: 'sos_status_created' }),
  ]).then(() => undefined).catch(error => { sosIndexesPromise = undefined; throw error; });
  await sosIndexesPromise;
  await offers.createIndex({ requestId:  1, driverId: 1 }, { unique: true, name: "dispatch_offer_request_driver" });
  await offers.createIndex({ driverId: 1, status: 1, expiresAt: 1 }, { name: "dispatch_offer_driver_status_expiry" });
  return { requests, drivers, hospitals, offers };
}

let workflowIndexesPromise: Promise<void> | undefined;
let hospitalRequestIndexesPromise: Promise<void> | undefined;
export async function getHospitalRequestsCollection() {
  const db = (await clientPromise).db();
  const hospitalRequests = db.collection<HospitalAdmissionRequest>("hospitalAdmissionRequests");
  hospitalRequestIndexesPromise ??= hospitalRequests.createIndex({ sosRequestId: 1 }, { name: 'hospital_requests_sos_id' }).then(() => undefined).catch(error => { hospitalRequestIndexesPromise = undefined; throw error; });
  await hospitalRequestIndexesPromise;
  return hospitalRequests;
}

export async function workflowCollections() {
  const db = (await clientPromise).db();
  const notifications = db.collection<CareNotification>("notifications");
  const ttlHours = Math.max(1, Number(process.env.NOTIFICATION_TTL_HOURS) || 24);
  workflowIndexesPromise ??= Promise.all([
    notifications.createIndex({ createdAt: 1 }, { name: 'notifications_ttl', expireAfterSeconds: ttlHours * 3600 }).catch(() => db.command({ collMod: 'notifications', index: { name: 'notifications_ttl', expireAfterSeconds: ttlHours * 3600 } })),
    // Match initializeIndexes()' default MongoDB index name so both startup
    // paths reuse the same index instead of creating a conflicting duplicate.
    notifications.createIndex({ recipientId: 1, createdAt: -1 }),
  ]).then(() => undefined).catch(error => { workflowIndexesPromise = undefined; throw error; });
  await workflowIndexesPromise;
  const hospitalRequests = await getHospitalRequestsCollection();
  return {
    hospitalRequests,
    hospitalAdmissions: db.collection<HospitalAdmission>("hospitalAdmissions"),
    notifications,
  };
}

export function validCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return typeof point.latitude === "number" && Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90
    && typeof point.longitude === "number" && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180;
}

export function mapsUrl(destination: Coordinates, origin?: Coordinates) {
  const params = new URLSearchParams({ api: "1", destination: `${destination.latitude},${destination.longitude}`, travelmode: "driving" });
  if (origin) params.set("origin", `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function distanceKm(a: Coordinates, b: Coordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/** Lazily expire offers and idempotently fan each round out to its nearest available batch. */
export async function advanceDispatch(requestId: string) {
  const { requests, drivers, offers } = await sosCollections();
  const now = new Date();
  const request = await requests.findOne({ _id: requestId, status: "searching" });
  if (!request) return;
  await offers.updateMany({ requestId, status: "offered", expiresAt: { $lte: now } }, { $set: { status: "expired" } });
  const round = request.dispatchRound ?? 0;
  const currentRoundFilter = round === 0 ? { $or: [{ dispatchRound: 0 }, { dispatchRound: { $exists: false } }] } : { dispatchRound: round };
  const stillOpen = await offers.countDocuments({ requestId, round, status: "offered", expiresAt: { $gt: now } });
  if (stillOpen) return;
  const complete = await offers.countDocuments({ requestId, round, status: { $in: ["rejected", "expired", "taken"] } });
  const roundOfferCount = await offers.countDocuments({ requestId, round });
  if (round > 0 && complete === 0 && roundOfferCount > 0) return;
  const nextRound = round + 1;
  if (nextRound > DISPATCH_MAX_ROUNDS) {
    await requests.updateOne({ _id: requestId, status: "searching", dispatchRound: round }, { $set: { status: "no_driver_found", noDriverFoundAt: now, dispatchRound: nextRound } });
    return;
  }
  const alreadyOffered = await offers.find({ requestId }).project({ driverId: 1 }).toArray();
  const excluded = alreadyOffered.map((offer) => offer.driverId);
  const candidates = await drivers.find({ available: true, activeRequestId: { $exists: false }, location: { $exists: true }, userId: { $nin: excluded } }).toArray();
  const radius = DISPATCH_BASE_RADIUS_KM * nextRound;
  const nearest = candidates.filter((driver) => validCoordinates(driver.location) && distanceKm(request.location, driver.location) <= radius)
    .sort((a, b) => distanceKm(request.location, a.location!) - distanceKm(request.location, b.location!)).slice(0, DISPATCH_BATCH_SIZE);
  // Guard the round transition; concurrent pollers can only win this CAS once.
  const advanced = await requests.updateOne({ _id: requestId, status: "searching", ...currentRoundFilter }, { $set: { dispatchRound: nextRound, dispatchRoundAt: now } });
  if (!advanced.modifiedCount) return;
  if (!nearest.length) {
    if (nextRound >= DISPATCH_MAX_ROUNDS) await requests.updateOne({ _id: requestId, status: "searching", dispatchRound: nextRound }, { $set: { status: "no_driver_found", noDriverFoundAt: now } });
    else await advanceDispatch(requestId);
    return;
  }
  const expiresAt = new Date(now.getTime() + OFFER_DURATION_MS);
  await offers.insertMany(nearest.map((driver) => ({ _id: `${requestId}:${nextRound}:${driver.userId}`, requestId, driverId: driver.userId, round: nextRound, createdAt: now, expiresAt, status: "offered" as const })), { ordered: false }).catch(() => undefined);
}

export async function expireAndReofferDriverOffers() {
  const { requests } = await sosCollections();
  const open = await requests.find({ status: "searching" }).project({ _id: 1 }).limit(100).toArray();
  await Promise.all(open.map((request) => advanceDispatch(request._id)));
}

export function createRequestId() { return randomUUID(); }
