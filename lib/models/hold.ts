export const ACTIVE_HOLD_STATUSES = ["queued", "pending", "confirmed"] as const;
export type HoldStatus = (typeof ACTIVE_HOLD_STATUSES)[number] | "rejected" | "expired" | "cancelled";
export type HoldCloseReason = "no_beds" | "cancelled" | "rejected" | "expired";

const configuredHoldDuration = Number(process.env.HOLD_DURATION_MS);
export const HOLD_DURATION_MS = Number.isFinite(configuredHoldDuration) && configuredHoldDuration > 0 ? configuredHoldDuration : 300_000;

export interface IPatientDetails {
  name?: string;
  age?: number;
  gender?: string;
  conditionSummary?: string;
  priority?: "critical" | "urgent" | "standard";
  etaMinutes?: number;
}

export interface IHold {
  id?: string;
  hospitalId: string;
  patientId: string;
  requestedByUserId: string;
  seq: number;
  status: HoldStatus;
  position?: number;
  expiresAt?: Date;
  reason?: HoldCloseReason;
  patientDetails?: IPatientDetails;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date;
}
