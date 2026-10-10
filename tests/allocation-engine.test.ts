import { describe, expect, it } from "vitest";
import { allocateBatch } from "../lib/allocation/engine.ts";
import { ReservationLedger } from "../lib/allocation/ledger.ts";
import type { AllocationHospital, AllocationPatient } from "../lib/allocation/types.ts";

const hospitals: AllocationHospital[] = [
  { id: "a", name: "A", travelTimeMinutes: 5, rejectionRate: 0.1, capabilities: ["trauma"], confirmedFree: { icu_bed: 1, emergency_bed: 1 }, closedTypes: [] },
  { id: "b", name: "B", travelTimeMinutes: 10, rejectionRate: 0.05, capabilities: ["trauma"], confirmedFree: { icu_bed: 2, emergency_bed: 2 }, closedTypes: [] },
];
const patient = (id: string, urgency: 1 | 2 | 3 = 2): AllocationPatient => ({ id, batchId: "batch", urgency, waitingMinutes: 0, resourceType: "icu_bed", capability: "trauma", etaMin: 20 });
const certain = () => 1;

describe("allocation engine", () => {
  it("allocates the constrained unit to higher urgency first and reports remaining capacity", () => {
    const result = allocateBatch([patient("low", 3), patient("critical", 1)], [{ ...hospitals[0], confirmedFree: { icu_bed: 1, emergency_bed: 0 } }], certain);
    expect(result.assignments.map((item) => item.patientId)).toEqual(["critical"]);
    expect(result.unserved).toEqual([{ patientId: "low", reason: "capacity_exhausted" }]);
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
});
