import { randomUUID } from "node:crypto";
import type { Collection, Document } from "mongodb";
import clientPromise from "./mongodb";

export type Coordinates = { latitude: number; longitude: number };

export type SosRequest = {
  _id: string;
  patientId: string;
  patientName: string;
  location: Coordinates;
  incidentType: string;
  requiredEquipment: string[];
  status: "searching" | "accepted" | "completed" | "cancelled";
  driverId: string | null;
  createdAt: Date;
  acceptedAt?: Date;
};

export async function sosCollections() {
  const db = (await clientPromise).db();
  const requests = db.collection<SosRequest>("sosRequests");
  const drivers = db.collection<Document & { userId: string; available: boolean; location?: Coordinates }>("drivers");
  const hospitals = db.collection<Document & { name: string; location: Coordinates; equipment: string[] }>("hospitals");
  return { requests, drivers, hospitals };
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
