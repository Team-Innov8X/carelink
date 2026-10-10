import { describe, expect, it } from "vitest";
import { GENERATOR, simulateWorld } from "../sim/world.ts";
import { splitForDay, splitPeriod } from "../sim/dataset.ts";

describe("seeded synthetic world", () => {
  it("produces identical data from the same seed", () => {
    const first = simulateWorld(123456);
    const second = simulateWorld(123456);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  }, 30_000);

  it("never emits negative occupancy or free capacity", () => {
    const period = simulateWorld(98765);
    for (const day of period.days) for (const hospital of day.hospitals) {
      expect(hospital.observed.occupancy).toHaveLength(1440);
      expect(hospital.groundTruth.freeUnits).toHaveLength(1440);
      expect(hospital.observed.occupancy.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
      expect(hospital.groundTruth.freeUnits.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
    }
  }, 30_000);

  it("uses chronological day boundaries for every split", () => {
    expect(splitForDay(1)).toBe("train");
    expect(splitForDay(30)).toBe("train");
    expect(splitForDay(31)).toBe("validation");
    expect(splitForDay(40)).toBe("validation");
    expect(splitForDay(41)).toBe("test");
    expect(splitForDay(50)).toBe("test");
    expect(() => splitForDay(0)).toThrow(RangeError);
    expect(() => splitForDay(51)).toThrow(RangeError);

    const splits = splitPeriod(simulateWorld(24680));
    expect(splits.train.days.map((day) => day.day)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(splits.validation.days.map((day) => day.day)).toEqual(Array.from({ length: 10 }, (_, index) => index + 31));
    expect(splits.test.days.map((day) => day.day)).toEqual(Array.from({ length: 10 }, (_, index) => index + 41));
    expect(GENERATOR.days).toBe(50);
  }, 30_000);
});
