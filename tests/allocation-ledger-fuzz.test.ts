import { describe, expect, it } from "vitest";
import { allocateBatch, createReplanState, replan } from "../lib/allocation/engine.ts";
import { ReservationLedger } from "../lib/allocation/ledger.ts";
import type { AllocationHospital, AllocationPatient, ReservationStatus, SimResourceType } from "../lib/allocation/types.ts";

const TYPES: SimResourceType[] = ["icu_bed", "emergency_bed"];
const seededRandom = (seed: number) => () => {
  seed |= 0; seed = seed + 0x6d2b79f5 | 0;
  let value = seed;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};
const statuses: ReservationStatus[] = ["confirmed", "arrived", "handed_over", "rejected", "expired", "cancelled", "lost", "arrival_failed"];

describe("allocation ledger invariants", () => {
  it("runs 1,000 seeded event sequences and checks I1–I6 after every event", () => {
    const random = seededRandom(20261013);
    let checkedEvents = 0;
    const replanKinds = new Set<string>();
    for (let sequence = 0; sequence < 1000; sequence += 1) {
      const hospitals: AllocationHospital[] = ["h0", "h1", "h2"].map((id) => ({
        id, name: id, travelTimeMinutes: 10, rejectionRate: 0, capabilities: [],
        confirmedFree: { icu_bed: 2, emergency_bed: 2 }, closedTypes: [],
      }));
      const ledger = new ReservationLedger(hospitals);
      const patients: AllocationPatient[] = Array.from({ length: 8 }, (_, index) => ({
        id: `p${index}`, batchId: `b${sequence}`, urgency: (Math.floor(random() * 3) + 1) as 1 | 2 | 3,
        waitingMinutes: Math.floor(random() * 60), resourceType: TYPES[Math.floor(random() * TYPES.length)], etaMin: 20,
      }));
      const state = createReplanState(patients);
      const forecaster = () => 1;
      allocateBatch(patients, hospitals, forecaster, ledger, state);
      for (let event = 0; event < 20; event += 1) {
        const patient = patients[Math.floor(random() * patients.length)];
        const hospital = hospitals[Math.floor(random() * hospitals.length)];
        const type = TYPES[Math.floor(random() * TYPES.length)];
        const operation = Math.floor(random() * 8);
        if (operation === 0) {
          ledger.reserve({ patientId: patient.id, batchId: patient.batchId, hospitalId: hospital.id, resourceType: patient.resourceType, requiredResourceType: patient.resourceType, at: event });
        } else if (operation === 1) {
          const active = ledger.getActiveReservations();
          if (active.length) {
            const reservation = active[Math.floor(random() * active.length)];
            const next = statuses[Math.floor(random() * statuses.length)];
            try { ledger.transition(reservation.id, next, event, "fuzz", "seeded operation"); } catch { /* illegal transitions must fail without corrupting state */ }
          }
        } else if (operation === 2) {
          if (random() < 0.6) {
            replanKinds.add("closure");
            replan({ type: "closure", hospitalId: hospital.id, resourceType: type, at: event }, hospitals, forecaster, ledger, state);
          }
          else ledger.setClosed(hospital.id, type, false, event);
        } else if (operation === 3) {
          ledger.setConfirmedFree(hospital.id, type, Math.floor(random() * 4));
        } else {
          const reservations = ledger.getActiveReservations();
          if (reservations.length) {
            const reservation = reservations[Math.floor(random() * reservations.length)];
            if (operation === 4 && reservation.status === "requested") {
              replanKinds.add("hospital_rejection");
              replan({ type: "hospital_rejection", reservationId: reservation.id, at: event }, hospitals, forecaster, ledger, state);
            } else if (operation === 5) {
              replanKinds.add("resource_loss");
              replan({ type: "resource_loss", reservationId: reservation.id, at: event }, hospitals, forecaster, ledger, state);
            } else if (operation === 6 && ["requested", "confirmed"].includes(reservation.status)) {
              replanKinds.add("eta_change");
              replan({ type: "eta_change", reservationId: reservation.id, newEtaMin: (state.patients.get(reservation.patientId)?.etaMin ?? patient.etaMin) + 30, at: event }, hospitals, forecaster, ledger, state);
            } else if (operation === 7 && ["requested", "confirmed"].includes(reservation.status)) {
              replanKinds.add("arrival_failure");
              if (reservation.status === "requested") ledger.transition(reservation.id, "confirmed", event, "fuzz", "prepared for arrival failure");
              ledger.transition(reservation.id, "arrived", event, "fuzz", "prepared for arrival failure");
              replan({ type: "arrival_failure", reservationId: reservation.id, at: event }, hospitals, forecaster, ledger, state);
            }
          }
        }
        ledger.assertInvariants();
        checkedEvents += 1;
      }
    }
    expect(checkedEvents).toBe(20_000);
    expect([...replanKinds].sort()).toEqual(["arrival_failure", "closure", "eta_change", "hospital_rejection", "resource_loss"]);
  }, 30_000);

  it("covers the six ledger invariants explicitly", () => {
    const hospital: AllocationHospital = { id: "h", name: "h", travelTimeMinutes: 1, rejectionRate: 0, capabilities: [], confirmedFree: { icu_bed: 1, emergency_bed: 0 }, closedTypes: [] };
    const ledger = new ReservationLedger([hospital]);
    const first = ledger.reserve({ patientId: "p1", batchId: "b", hospitalId: "h", resourceType: "icu_bed", requiredResourceType: "icu_bed" })!;
    // I1: reserving a second unit over the confirmed free capacity is refused.
    expect(ledger.reserve({ patientId: "p2", batchId: "b", hospitalId: "h", resourceType: "icu_bed", requiredResourceType: "icu_bed" })).toBeNull();
    // I2: same patient cannot have a second active reservation, even in another batch.
    expect(ledger.reserve({ patientId: "p1", batchId: "other", hospitalId: "h", resourceType: "icu_bed", requiredResourceType: "icu_bed" })).toBeNull();
    // I3: idempotent duplicate resolves to the same canonical reservation id.
    expect(ledger.reserve({ patientId: "p1", batchId: "b", hospitalId: "h", resourceType: "icu_bed", requiredResourceType: "icu_bed" })?.reservation.id).toBe(first.reservation.id);
    expect(new Set(ledger.getActiveReservations().map((item) => item.id)).size).toBe(1);
    // I4: resource mismatch is rejected before creating a reservation.
    expect(() => ledger.reserve({ patientId: "p2", batchId: "b", hospitalId: "h", resourceType: "emergency_bed", requiredResourceType: "icu_bed" })).toThrow(/I4/);
    // I5: closure terminates active reservations before closure becomes effective.
    ledger.setClosed("h", "icu_bed", true);
    expect(ledger.getActiveReservations()).toHaveLength(0);
    // I6: invalid state transitions throw, while valid transition histories are checked after every event.
    expect(() => ledger.transition(first.reservation.id, "handed_over", 2, "test", "invalid jump")).toThrow(/Invalid reservation transition/);
    ledger.assertInvariants();
  });
});
