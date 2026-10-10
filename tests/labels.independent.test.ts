import { describe, expect, it } from "vitest";
import { simulateWorld, type HospitalDay } from "../sim/world.ts";

/** Independent test oracle: deliberately does not call the generator's label helper. */
function labelFromRawTimeline(raw: HospitalDay, decisionMinute: number, etaMinutes: number, unitsNeeded: number): 0 | 1 {
  const arrivalMinute = decisionMinute + etaMinutes;
  if (arrivalMinute >= raw.groundTruth.freeUnits.length) return 0;
  return raw.groundTruth.freeUnits[arrivalMinute] >= unitsNeeded ? 1 : 0;
}

describe("independent ground-truth labels", () => {
  it("re-derives validation-day labels from the raw free-unit timeline", () => {
    const period = simulateWorld(20261010, 40);
    const validationDays = period.days.filter((day) => day.day >= 31 && day.day <= 40);
    const validationSamples = period.samples.filter((sample) => sample.day >= 31 && sample.day <= 40);
    const days = new Map(validationDays.map((day) => [day.day, day]));
    for (const sample of validationSamples) {
      const day = days.get(sample.day);
      expect(day).toBeDefined();
      const raw = day!.hospitals.find((hospital) => hospital.hospitalId === sample.hospitalId && hospital.resourceType === sample.resourceType);
      expect(raw).toBeDefined();
      expect(labelFromRawTimeline(raw!, sample.minute, sample.etaMin, sample.unitsNeeded)).toBe(sample.label);
      expect(sample.features.freeNow).toBe(raw!.observed.availableUnits[sample.minute]);
      expect(sample.features.currentStayElapsedMinutes).toHaveLength(raw!.observed.occupancy[sample.minute]);
      expect(sample.features.walkInsLast30Min).toBe(raw!.observed.walkInArrivals.slice(Math.max(0, sample.minute - 30), sample.minute).reduce((sum, count) => sum + count, 0));
    }
  }, 30_000);
});
