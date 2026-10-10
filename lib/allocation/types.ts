/** Simulation-only allocation types. Production Mongo models are mapped in production-adapter.ts. */
export type SimResourceType = "icu_bed" | "emergency_bed";
export type ReservationStatus = "proposed" | "requested" | "confirmed" | "arrived" | "handed_over" | "rejected" | "expired" | "lost" | "arrival_failed" | "cancelled";
export type UnservedReason = "no_compatible_resource" | "no_capability_match" | "capacity_exhausted" | "hospitals_closed" | "displaced_by_higher_priority" | "rejected_no_alternative" | "handover_failed" | "travel_time_limit";

export interface AllocationPatient {
  id: string;
  batchId: string;
  urgency: 1 | 2 | 3;
  waitingMinutes: number;
  resourceType: SimResourceType;
  capability?: string;
  etaMin: number;
  travelTimeLimitMin?: number;
}

export interface AllocationHospital {
  id: string;
  name: string;
  travelTimeMinutes: number;
  rejectionRate: number;
  capabilities: string[];
  /** Confirmed free units available to platform patients, before this batch. */
  confirmedFree: Record<SimResourceType, number>;
  closedTypes: SimResourceType[];
}

export interface Reservation {
  id: string;
  patientId: string;
  batchId: string;
  hospitalId: string;
  resourceType: SimResourceType;
  status: ReservationStatus;
  createdAt: number;
  history: Array<{ from: ReservationStatus | null; to: ReservationStatus; at: number; actor: string; reason: string }>;
}

export interface ForecastInput {
  hospital: AllocationHospital;
  patient: AllocationPatient;
  unitsNeeded: number;
}
export type AvailabilityForecaster = (input: ForecastInput) => number;

export interface AllocationAssignment {
  patientId: string;
  hospitalId: string;
  reservationId: string;
  p_available: number;
  travelTimeMinutes: number;
  cost: number;
  reason: string;
}

export interface UnservedPatient { patientId: string; reason: UnservedReason }
export interface AllocationResult { assignments: AllocationAssignment[]; unserved: UnservedPatient[] }
