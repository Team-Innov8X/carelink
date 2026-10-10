import { describe, expect, it } from "vitest";
import { rankConditionHospitals, patientForCondition, type RecommendationHospital } from "../lib/recommend/engine.ts";
import { ReservationLedger } from "../lib/allocation/ledger.ts";
import type { SimResourceType } from "../lib/allocation/types.ts";

const hospital = (id: string, changes: Partial<RecommendationHospital> = {}): RecommendationHospital => ({
  id, name: id.toUpperCase(), travelTimeMinutes: 10, rejectionRate: 0.1, capabilities: ["cardiac"],
  confirmedFree: { icu_bed: 1, emergency_bed: 1 }, supportedTypes: ["icu_bed", "emergency_bed"], closedTypes: [],
  coordinates: { latitude: 0, longitude: 0 }, occupancyRatio: 0.5, recentRejectionRate: 0.1, walkInsLast30Min: 0, capacity: 5,
  casesHandled: { cardiac_event: 40 }, ...changes,
});
const patient = patientForCondition("p1", "cardiac_event", 15);

describe("condition-based recommendation ranking", () => {
  it("filters capacity, capability, closure, distance, and rejected hospitals before scoring", () => {
    const hospitals = [
      hospital("ok"), hospital("empty", { confirmedFree: { icu_bed: 0, emergency_bed: 1 } }),
      hospital("no-tag", { capabilities: [] }), hospital("closed", { closedTypes: ["icu_bed"] }),
      hospital("far", { travelTimeMinutes: 61 }), hospital("rejected"),
    ];
    const result = rankConditionHospitals({ patient, conditionId: "cardiac_event", hospitals, ledger: new ReservationLedger(hospitals), rejectedHospitalIds: new Set(["rejected"]), acceptanceProbability: () => 0.9 });
    expect(result.ranked.map((item) => item.hospitalId)).toEqual(["ok"]);
  });

  it("uses the declared cost formula only among hard-feasible hospitals", () => {
    const hospitals = [hospital("near", { travelTimeMinutes: 8, casesHandled: { cardiac_event: 0 } }), hospital("experienced", { travelTimeMinutes: 15, casesHandled: { cardiac_event: 100 } })];
    const result = rankConditionHospitals({ patient, conditionId: "cardiac_event", hospitals, ledger: new ReservationLedger(hospitals), availabilityProbability: (hospital) => hospital.id === "near" ? 0.5 : 1, acceptanceProbability: (item) => item.id === "near" ? 0.5 : 0.95 });
    expect(result.chosen?.hospitalId).toBe("experienced");
    expect(result.chosen?.cost).toBeCloseTo(15 + 0 + 1 - 3);
  });

  it("falls back to current capacity on forecast/model errors and reports each fallback", () => {
    const hospitals = [hospital("fallback")];
    const result = rankConditionHospitals({ patient, conditionId: "cardiac_event", hospitals, ledger: new ReservationLedger(hospitals), availabilityProbability: () => Number.NaN, acceptanceProbability: () => { throw new Error("model missing"); } });
    expect(result.chosen?.p_available).toBe(1);
    expect(result.chosen?.p_accept).toBe(1);
    expect(result.fallbackFlags.sort()).toEqual(["accept_model_fallback", "forecast_fallback"]);
  });

  it("validates driver override reason and feasibility", () => {
    const hospitals = [hospital("first"), hospital("second")];
    const ledger = new ReservationLedger(hospitals);
    expect(rankConditionHospitals({ patient, conditionId: "cardiac_event", hospitals, ledger, acceptanceProbability: () => 0.9, override: { hospitalId: "second", reason: "Driver requested the closer transfer" } }).chosen?.hospitalId).toBe("second");
    expect(() => rankConditionHospitals({ patient, conditionId: "cardiac_event", hospitals, ledger, override: { hospitalId: "unknown", reason: "override" } })).toThrow(/not feasible/);
    expect(() => rankConditionHospitals({ patient, conditionId: "cardiac_event", hospitals, ledger, override: { hospitalId: "first", reason: " " } })).toThrow(/reason/);
  });

  it("never emits an incompatible resource or a closed/full option across seeded cases", () => {
    let seed = 1337;
    const random = () => { seed = seed + 0x6d2b79f5 | 0; let value = seed; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
    for (let run = 0; run < 1000; run += 1) {
      const type = (random() < 0.5 ? "icu_bed" : "emergency_bed") as SimResourceType;
      const hospitals = Array.from({ length: 6 }, (_, index) => hospital(`h${index}`, {
        capabilities: random() < 0.6 ? ["cardiac"] : [], travelTimeMinutes: Math.floor(random() * 75),
        confirmedFree: { icu_bed: Math.floor(random() * 3), emergency_bed: Math.floor(random() * 3) },
        closedTypes: random() < 0.15 ? [type] : [],
      }));
      const conditionId = type === "icu_bed" ? "cardiac_event" : "major_trauma";
      const capability = type === "icu_bed" ? "cardiac" : "trauma";
      const p = { ...patientForCondition(`p${run}`, conditionId, 15), batchId: `b${run}` };
      const matchingHospitals = hospitals.map((item) => ({ ...item, capabilities: random() < 0.6 ? [capability] : [] }));
      const ledger = new ReservationLedger(matchingHospitals);
      const result = rankConditionHospitals({ patient: p, conditionId, hospitals: matchingHospitals, ledger, acceptanceProbability: () => 0.5 });
      for (const candidate of result.ranked) {
        const source = matchingHospitals.find((item) => item.id === candidate.hospitalId)!;
        expect(source.confirmedFree[type]).toBeGreaterThan(0);
        expect(source.closedTypes).not.toContain(type);
        expect(source.capabilities).toContain(capability);
        expect(source.travelTimeMinutes).toBeLessThanOrEqual(60);
      }
    }
  });
});
