import { describe, expect, it } from "vitest";
import { GENERATOR, simulateWorld } from "../sim/world.ts";
import { splitForDay } from "../sim/dataset.ts";

const isValidationDay = (day: number) => day >= 31 && day <= 40;
const validationView = (period: ReturnType<typeof simulateWorld>) => ({
  seed: period.seed,
  days: period.days.filter((day) => isValidationDay(day.day)),
  samples: period.samples.filter((sample) => isValidationDay(sample.day)),
  stayRecords: period.stayRecords.filter((stay) => stay.admissionDay >= 31 && stay.admissionDay <= 40),
});

describe("seeded synthetic world", () => {
  it("produces identical data from the same seed", () => {
    const first = simulateWorld(123456, 40);
    const second = simulateWorld(123456, 40);
    expect(JSON.stringify(validationView(first))).toBe(JSON.stringify(validationView(second)));
  }, 30_000);

  it("never emits negative occupancy or free capacity", () => {
    const period = simulateWorld(98765, 40);
    for (const day of period.days.filter((item) => isValidationDay(item.day))) for (const hospital of day.hospitals) {
      expect(hospital.observed.occupancy).toHaveLength(1440);
      expect(hospital.groundTruth.freeUnits).toHaveLength(1440);
      expect(hospital.observed.occupancy.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
      expect(hospital.groundTruth.freeUnits.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
    }
  }, 30_000);

  it("uses chronological day boundaries for training and validation", () => {
    expect(splitForDay(1)).toBe("train");
    expect(splitForDay(30)).toBe("train");
    expect(splitForDay(31)).toBe("validation");
    expect(splitForDay(40)).toBe("validation");
    expect(() => splitForDay(0)).toThrow(RangeError);
    expect(() => splitForDay(51)).toThrow(RangeError);
    expect(GENERATOR.days).toBe(50);
  }, 30_000);
});
