import { createHold } from "../services/hold-service.ts";
import type { AllocationAssignment, AllocationPatient } from "./types.ts";

/** Translates a simulation assignment into the existing production bed-hold service contract. */
export async function createProductionHoldForAssignment(
  assignment: AllocationAssignment,
  patient: AllocationPatient,
  options: { requestedByUserId?: string; originLocation?: [number, number]; notes?: string } = {},
) {
  if (assignment.patientId !== patient.id) throw new Error("Assignment and patient do not match.");
  const priority = patient.urgency === 1 ? "critical" : patient.urgency === 2 ? "urgent" : "standard";
  return createHold({
    hospitalId: assignment.hospitalId,
    patientId: patient.id,
    resourceType: "bed",
    category: patient.resourceType === "icu_bed" ? "icu" : "emergency",
    requestedByUserId: options.requestedByUserId,
    patientDetails: { priority, etaMinutes: Math.round(assignment.travelTimeMinutes) },
    quantity: 1,
    originLocation: options.originLocation,
    notes: options.notes ?? `Allocation engine reservation ${assignment.reservationId}`,
  });
}
