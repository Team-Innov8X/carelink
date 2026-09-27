import { randomUUID } from "node:crypto";
import type { Document } from "mongodb";
import clientPromise from "./mongodb";

export type Coordinates = { latitude: number; longitude: number };

export type SosRequest = {
  _id: string;
  patientId: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  location: Coordinates;
  incidentType: string;
  requiredEquipment: string[];
  status: "searching" | "accepted" | "completed" | "cancelled";
  driverId: string | null;
  createdAt: Date;
  acceptedAt?: Date;
  arrivedAt?: Date;
};

export type HospitalAdmissionRequest = {
  _id: string;
  sosRequestId: string;
  idempotencyKey?: string;
  hospitalId: string;
  hospitalName: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  location: Coordinates;
  incidentType: string;
  requiredEquipment: string[];
  requiredSpecialty?: string;
  status: "pending" | "accepting" | "accepted" | "rejected";
  requestType?: "sos" | "bed";
  inventorySource?: "app-state";
  bedCategory?: "general" | "icu" | "trauma" | "ventilators";
  holdId?: string;
  doctorHoldId?: string;
  acceptedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date;
};

let hospitalRequestIndexes: Promise<void> | undefined;

async function ensureHospitalRequestIndexes(hospitalRequests: Awaited<ReturnType<typeof workflowCollections>>["hospitalRequests"]) {
  if (!hospitalRequestIndexes) {
    hospitalRequestIndexes = hospitalRequests.createIndex(
      { idempotencyKey: 1 },
      { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
    ).then(() => undefined).catch((error: unknown) => {
      hospitalRequestIndexes = undefined;
      throw error;
    });
  }
  await hospitalRequestIndexes;
}

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
  await ensureHospitalRequestIndexes(hospitalRequests);
  const existing = await hospitalRequests.findOne({ sosRequestId: sos._id });
  if (existing) {
    if (!existing.idempotencyKey) {
      try {
        await hospitalRequests.updateOne({ _id: existing._id, idempotencyKey: { $exists: false } }, { $set: { idempotencyKey: sos._id } });
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
      }
    }
    if (existing.status === "pending" && nearbyDemo && (existing.inventorySource !== "app-state" || !existing.requiredSpecialty)) {
      const hospitalId = String(nearbyDemo.hospital.id ?? "");
      const hospitalName = String(nearbyDemo.hospital.name ?? "");
      if (hospitalId && hospitalName) {
        await hospitalRequests.updateOne({ _id: existing._id, status: "pending" }, { $set: {
          hospitalId,
          hospitalName,
          inventorySource: "app-state",
          bedCategory: existing.bedCategory ?? chooseBedCategory([sos.incidentType, ...sos.requiredEquipment], nearbyDemo.hospital.beds),
          requiredSpecialty: chooseRequiredSpecialty(sos.incidentType, sos.requiredEquipment, nearbyDemo.hospital.specialties),
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
        idempotencyKey: sos._id,
        requestType: "sos",
        inventorySource: "app-state",
        bedCategory: chooseBedCategory([sos.incidentType, ...sos.requiredEquipment], nearbyDemo.hospital.beds),
        requiredSpecialty: chooseRequiredSpecialty(sos.incidentType, sos.requiredEquipment, nearbyDemo.hospital.specialties),
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
      try {
        await hospitalRequests.insertOne(request);
        return request;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
        const concurrent = await hospitalRequests.findOne({ idempotencyKey: sos._id });
        if (concurrent) return concurrent;
        throw error;
      }
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
    idempotencyKey: sos._id,
    requestType: "sos",
    hospitalId: String(nearest.hospital._id),
    hospitalName: nearest.hospital.name,
    patientId: sos.patientId,
    patientName: sos.patientName,
    patientPhone: sos.patientPhone,
    location: sos.location,
    incidentType: sos.incidentType,
    requiredEquipment: sos.requiredEquipment,
    requiredSpecialty: chooseRequiredSpecialty(sos.incidentType, sos.requiredEquipment, nearest.hospital.specialties),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await hospitalRequests.insertOne(request);
    return request;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
    const concurrent = await hospitalRequests.findOne({ idempotencyKey: sos._id });
    if (concurrent) return concurrent;
    throw error;
  }
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
      ? ["icu"]
      : ["general", "icu", "trauma"];
  return preference.find((category) => typeof beds[category]?.available === "number" && beds[category].available > 0)
    ?? preference[0];
}

export function chooseRequiredSpecialty(incidentType: string, equipment: string[], specialtiesValue: unknown) {
  const specialties = Array.isArray(specialtiesValue) ? specialtiesValue.filter((value): value is string => typeof value === "string") : [];
  const needs = `${incidentType} ${equipment.join(" ")}`.toLowerCase();
  const preferred = /cardiac|heart/.test(needs) ? ["Cardiac", "ICU"]
    : /stroke|neuro|brain/.test(needs) ? ["Neurology", "ICU"]
      : /trauma|injur|fracture|accident|orthop/.test(needs) ? ["Trauma Care", "Orthopedics", "ICU"]
        : /icu|critical|ventilat|breath|respirat/.test(needs) ? ["ICU", "General Care"]
          : ["General Care", "Trauma Care", "ICU"];
  return preferred.find((name) => specialties.some((specialty) => specialty.toLowerCase() === name.toLowerCase()))
    ?? specialties[0]
    ?? preferred[0];
}

export type CareNotification = {
  _id: string;
  recipientId: string;
  type: "hospital_request_accepted";
  title: string;
  message: string;
  relatedRequestId: string;
  readAt?: Date;
  createdAt: Date;
};

export async function sosCollections() {
  const db = (await clientPromise).db();
  const requests = db.collection<SosRequest>("sosRequests");
  const drivers = db.collection<Document & { userId: string; available: boolean; location?: Coordinates }>("drivers");
  const hospitals = db.collection<Document & { name: string; location: Coordinates; equipment: string[] }>("hospitals");
  return { requests, drivers, hospitals };
}

export async function workflowCollections() {
  const db = (await clientPromise).db();
  return {
    hospitalRequests: db.collection<HospitalAdmissionRequest>("hospitalAdmissionRequests"),
    notifications: db.collection<CareNotification>("notifications"),
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

export function createRequestId() { return randomUUID(); }
