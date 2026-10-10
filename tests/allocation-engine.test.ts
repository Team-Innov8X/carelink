import { describe, expect, it } from "vitest";
import { allocateBatch, createReplanState, replan } from "../lib/allocation/engine.ts";
import { ReservationLedger } from "../lib/allocation/ledger.ts";
import type { AllocationHospital, AllocationPatient, SimResourceType } from "../lib/allocation/types.ts";

const hospitals: AllocationHospital[] = [
  { id: "a", name: "A", travelTimeMinutes: 5, rejectionRate: 0.1, capabilities: ["trauma"], confirmedFree: { icu_bed: 1, emergency_bed: 1 }, closedTypes: [] },
  { id: "b", name: "B", travelTimeMinutes: 10, rejectionRate: 0.05, capabilities: ["trauma"], confirmedFree: { icu_bed: 2, emergency_bed: 2 }, closedTypes: [] },
];
const patient = (id: string, urgency: 1 | 2 | 3 = 2): AllocationPatient => ({ id, batchId: "batch", urgency, waitingMinutes: 0, resourceType: "icu_bed", capability: "trauma", etaMin: 20 });
const certain = () => 1;
const threeHospitals: AllocationHospital[] = [
  { ...hospitals[0], confirmedFree: { icu_bed: 1, emergency_bed: 1 } },
  { ...hospitals[1], confirmedFree: { icu_bed: 1, emergency_bed: 1 } },
  { id: "c", name: "C", travelTimeMinutes: 20, rejectionRate: 0, capabilities: ["trauma"], confirmedFree: { icu_bed: 1, emergency_bed: 1 }, closedTypes: [] },
];

function seedAllocation(patients: AllocationPatient[], snapshot: AllocationHospital[] = threeHospitals) {
  const ledger = new ReservationLedger(snapshot);
  const state = createReplanState(patients);
  const result = allocateBatch(patients, snapshot, certain, ledger, state);
  return { ledger, state, result };
}

function confirm(ledger: ReservationLedger, reservationId: string) {
  ledger.transition(reservationId, "confirmed", 1, "test", "confirmed for test case");
}

describe("allocation engine", () => {
  it("allocates the constrained unit to higher urgency first and reports remaining capacity", () => {
    const result = allocateBatch([patient("low", 3), patient("critical", 1)], [{ ...hospitals[0], confirmedFree: { icu_bed: 1, emergency_bed: 0 } }], certain);
    expect(result.assignments.map((item) => item.patientId)).toEqual(["critical"]);
    expect(result.unserved).toEqual([{ patientId: "low", reason: "displaced_by_higher_priority" }]);
  });

  it("uses the existing ranking feasibility matcher and never downgrades resource or capability", () => {
    const result = allocateBatch([patient("p")], [{ ...hospitals[0], capabilities: [], confirmedFree: { icu_bed: 1, emergency_bed: 2 } }], certain);
    expect(result.assignments).toHaveLength(0);
    expect(result.unserved[0].reason).toBe("no_capability_match");
  });

  it("chooses the lower travel-plus-forecast cost and falls back on invalid forecasts", () => {
    const ledger = new ReservationLedger(hospitals);
    const result = allocateBatch([patient("p")], hospitals, ({ hospital }) => hospital.id === "a" ? Number.NaN : 0.5, ledger);
    expect(result.assignments[0].hospitalId).toBe("a");
    expect(result.assignments[0].reason).toContain("fallback");
  });

  it("prevents duplicate patient reservations across hospitals", () => {
    const ledger = new ReservationLedger(hospitals);
    const result = allocateBatch([patient("p")], hospitals, certain, ledger);
    const duplicate = ledger.reserve({ patientId: "p", batchId: "batch", hospitalId: "b", resourceType: "icu_bed", requiredResourceType: "icu_bed" });
    expect(result.assignments).toHaveLength(1);
    expect(duplicate?.created).toBe(false);
    expect(ledger.getActiveReservations()).toHaveLength(1);
  });

  it("replans a rejected patient only and preserves other confirmed reservations deeply", () => {
    const patients = [patient("rejected"), patient("untouched")];
    const { ledger, state, result } = seedAllocation(patients);
    const rejectedAssignment = result.assignments.find((item) => item.patientId === "rejected")!;
    const untouchedAssignment = result.assignments.find((item) => item.patientId === "untouched")!;
    confirm(ledger, untouchedAssignment.reservationId);
    const untouchedBefore = structuredClone(ledger.reservations.find((item) => item.id === untouchedAssignment.reservationId));
    const replanned = replan({ type: "hospital_rejection", reservationId: rejectedAssignment.reservationId, at: 2 }, threeHospitals, certain, ledger, state);
    expect(replanned.assignments).toHaveLength(1);
    expect(replanned.assignments[0].patientId).toBe("rejected");
    expect(ledger.reservations.find((item) => item.id === untouchedAssignment.reservationId)).toEqual(untouchedBefore);
  });

  it("replans only the patient whose confirmed unit was lost", () => {
    const patients = [patient("lost"), patient("untouched")];
    const { ledger, state, result } = seedAllocation(patients);
    const lostAssignment = result.assignments.find((item) => item.patientId === "lost")!;
    const untouchedAssignment = result.assignments.find((item) => item.patientId === "untouched")!;
    confirm(ledger, lostAssignment.reservationId);
    confirm(ledger, untouchedAssignment.reservationId);
    const untouchedBefore = structuredClone(ledger.reservations.find((item) => item.id === untouchedAssignment.reservationId));
    const replanned = replan({ type: "resource_loss", reservationId: lostAssignment.reservationId, at: 2 }, threeHospitals, certain, ledger, state);
    expect(replanned.assignments).toHaveLength(1);
    expect(replanned.assignments[0].patientId).toBe("lost");
    expect(ledger.reservations.find((item) => item.id === untouchedAssignment.reservationId)).toEqual(untouchedBefore);
  });

  it("reports hospitals_closed when the only compatible hospital closes", () => {
    const only = [{ ...hospitals[0], confirmedFree: { icu_bed: 1, emergency_bed: 0 } }];
    const p = patient("closed");
    const { ledger, state, result } = seedAllocation([p], only);
    const assignment = result.assignments[0];
    const replanned = replan({ type: "closure", hospitalId: assignment.hospitalId, resourceType: "icu_bed", at: 2 }, only, certain, ledger, state);
    expect(replanned.unserved).toEqual([{ patientId: p.id, reason: "hospitals_closed" }]);
  });

  it("reports capacity_exhausted without downgrading an ICU request to emergency bed", () => {
    const only = [{ ...hospitals[0], confirmedFree: { icu_bed: 1, emergency_bed: 5 } }];
    const result = allocateBatch([patient("icu-1"), patient("icu-2")], only, certain);
    expect(result.assignments).toHaveLength(1);
    expect(result.unserved).toEqual([{ patientId: "icu-2", reason: "capacity_exhausted" }]);
  });

  it("reports capacity_exhausted when the supported resource has zero free units at snapshot time", () => {
    const full: AllocationHospital[] = [{ ...hospitals[0], confirmedFree: { icu_bed: 0, emergency_bed: 0 }, supportedTypes: ["icu_bed", "emergency_bed"] as SimResourceType[] }];
    const result = allocateBatch([patient("already-full")], full, certain);
    expect(result.unserved).toEqual([{ patientId: "already-full", reason: "capacity_exhausted" }]);
  });

  it("reports rejected_no_alternative after a rejection with no other hospital", () => {
    const only = [{ ...hospitals[0], confirmedFree: { icu_bed: 1, emergency_bed: 0 } }];
    const p = patient("rejected-no-alt");
    const { ledger, state, result } = seedAllocation([p], only);
    const replanned = replan({ type: "hospital_rejection", reservationId: result.assignments[0].reservationId, at: 2 }, only, certain, ledger, state);
    expect(replanned.unserved).toEqual([{ patientId: p.id, reason: "rejected_no_alternative" }]);
  });

  it("marks handover_failed after two arrival failures", () => {
    const p = patient("two-failures");
    const { ledger, state, result } = seedAllocation([p]);
    let assignment = result.assignments[0];
    confirm(ledger, assignment.reservationId);
    ledger.transition(assignment.reservationId, "arrived", 2, "test", "first arrival attempt");
    const first = replan({ type: "arrival_failure", reservationId: assignment.reservationId, at: 3 }, threeHospitals, certain, ledger, state);
    expect(first.assignments).toHaveLength(1);
    assignment = first.assignments[0];
    confirm(ledger, assignment.reservationId);
    ledger.transition(assignment.reservationId, "arrived", 4, "test", "second arrival attempt");
    const second = replan({ type: "arrival_failure", reservationId: assignment.reservationId, at: 5 }, threeHospitals, certain, ledger, state);
    expect(second.unserved).toEqual([{ patientId: p.id, reason: "handover_failed" }]);
  });

  it("allows at most two reroutes, then returns handover_failed", () => {
    const patientHospitals = [
      { ...threeHospitals[0], travelTimeMinutes: 1 },
      { ...threeHospitals[1], travelTimeMinutes: 2 },
      { ...threeHospitals[2], travelTimeMinutes: 3 },
    ];
    const p = patient("reroute-limit");
    const { ledger, state, result } = seedAllocation([p], patientHospitals);
    let assignment = result.assignments[0];
    let rerouteCount = 0;
    for (let index = 0; index < 3; index += 1) {
      const replanned = replan({ type: "hospital_rejection", reservationId: assignment.reservationId, at: index + 2 }, patientHospitals, certain, ledger, state);
      if (index < 2) {
        expect(replanned.assignments).toHaveLength(1);
        assignment = replanned.assignments[0];
        rerouteCount += 1;
      } else {
        expect(replanned.unserved).toEqual([{ patientId: p.id, reason: "handover_failed" }]);
      }
    }
    expect(rerouteCount).toBe(2);
  });

  it("returns no changes for an ETA update of 10 minutes and replans above the threshold", () => {
    const p = patient("eta");
    const { ledger, state, result } = seedAllocation([p]);
    const reservationId = result.assignments[0].reservationId;
    const before = structuredClone(ledger.reservations.find((item) => item.id === reservationId));
    expect(replan({ type: "eta_change", reservationId, newEtaMin: 30, at: 2 }, threeHospitals, certain, ledger, state)).toEqual({ assignments: [], unserved: [] });
    expect(ledger.reservations.find((item) => item.id === reservationId)).toEqual(before);
    expect(replan({ type: "eta_change", reservationId, newEtaMin: 31, at: 3 }, threeHospitals, certain, ledger, state).assignments).toHaveLength(1);
  });

  it("lets exactly one of two patients racing for the final unit win with a reason for the other", () => {
    const only = [{ ...hospitals[0], confirmedFree: { icu_bed: 1, emergency_bed: 0 } }];
    const result = allocateBatch([patient("race-a"), patient("race-b")], only, certain);
    expect(result.assignments).toHaveLength(1);
    expect(result.unserved).toHaveLength(1);
    expect(result.unserved[0].reason).toBe("capacity_exhausted");
  });

  it("marks a lower-urgency patient displaced by a higher-priority patient", () => {
    const only = [{ ...hospitals[0], confirmedFree: { icu_bed: 1, emergency_bed: 0 } }];
    const result = allocateBatch([patient("low-priority", 3), patient("high-priority", 1)], only, certain);
    expect(result.assignments.map((item) => item.patientId)).toEqual(["high-priority"]);
    expect(result.unserved).toEqual([{ patientId: "low-priority", reason: "displaced_by_higher_priority" }]);
  });
});
