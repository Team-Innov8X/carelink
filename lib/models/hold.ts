import type { ObjectId } from "mongodb";

export type HoldStatus =
  | "queued"     // In queue for a bed
  | "pending"    // Hold placed, awaiting hospital confirmation or arrival
  | "confirming"
  | "releasing"
  | "confirmed"  // Confirmed by hospital staff
  | "fulfilled"  // Patient arrived & resource assigned
  | "discharged" // Resource returned to inventory after discharge
  | "expired"    // Auto-expired because hold window lapsed
  | "rejected"   // Hospital declined the request
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
  _id?: ObjectId | string;
  id?: string;
  patientId?: string; // Patient ID
  hospitalId: string;
  resourceId: string;
  seq?: number;
  queuePosition?: number;
  ambulanceId?: string;
  parentHoldId?: string;
  escalationHoldId?: string;
  escalationCheckedAt?: Date;
  escalationAttempts?: number;
  releaseReason?: "cancelled" | "expired" | "rejected";
  requestedByUserId?: string; // User ID of dispatcher, driver, or patient placing the hold
  patientDetails?: IPatientDetails;
  quantity?: number;
  status: HoldStatus;
  expiresAt?: Date;
  purgeAt?: Date;
  confirmedAt?: Date;
  confirmedByUserId?: string;
  fulfilledAt?: Date;
  notes?: string;
  originLocation?: [number, number];
  createdAt: Date;
  updatedAt: Date;
}
