import type { ObjectId } from "mongodb";

export type HoldStatus =
  | "pending"    // Hold placed, awaiting hospital confirmation or arrival
  | "confirmed"  // Confirmed by hospital staff
  | "fulfilled"  // Patient arrived & resource assigned
  | "expired"    // Auto-expired because hold window lapsed
  | "cancelled";  // Cancelled by requester or staff

export type PriorityLevel = "critical" | "urgent" | "standard";

export interface IPatientDetails {
  name?: string;
  age?: number;
  gender?: string;
  conditionSummary?: string;
  priority: PriorityLevel;
  etaMinutes?: number; // Estimated Time of Arrival for ambulance
}

export interface IHold {
  _id?: ObjectId;
  id?: string;
  hospitalId: string;
  resourceId: string;
  requestedByUserId: string; // User ID of dispatcher or driver placing the hold
  patientDetails: IPatientDetails;
  quantity: number;
  status: HoldStatus;
  expiresAt: Date;
  confirmedAt?: Date;
  fulfilledAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
