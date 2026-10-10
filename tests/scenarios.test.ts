import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Scenario = {
  id: string;
  seed: number;
  inputs: {
    day: number;
    patients: Array<{ id: string; resourceType: string }>;
    events: Array<{ kind: string }>;
    scenarioNotes: Record<string, unknown>;
  };
  expectedOutcomes: {
    baseline: { patients: Array<{ minutes: number | null; reason: string | null }> };
    modelAware: { patients: Array<{ minutes: number | null; reason: string | null }>; logs: Array<{ event: string }> };
  };
};

const scenario = (id: string) => JSON.parse(readFileSync(join(process.cwd(), "data", "scenarios", `${id}.json`), "utf8")) as Scenario;

describe("HLTH02 demo scenarios", () => {
  it("has all six seeded scenarios with validation-day inputs", () => {
    const items = ["S1", "S2", "S3", "S4", "S5", "S6"].map(scenario);
    expect(items.map((item) => item.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
    expect(items.every((item) => Number.isInteger(item.seed) && item.inputs.day >= 31 && item.inputs.day <= 40)).toBe(true);
  });

  it("serves all four patients in normal operation", () => {
    const item = scenario("S1");
    expect(item.expectedOutcomes.modelAware.patients).toHaveLength(4);
    expect(item.expectedOutcomes.modelAware.patients.every((patient) => patient.minutes !== null)).toBe(true);
  });

  it("keeps the surge scenario on ICU and leaves patients unserved when capacity is short", () => {
    const item = scenario("S2");
    expect(item.inputs.patients).toHaveLength(14);
    expect(item.inputs.patients.every((patient) => patient.resourceType === "icu_bed")).toBe(true);
    expect(item.expectedOutcomes.modelAware.patients.filter((patient) => patient.minutes !== null)).toHaveLength(2);
    expect(item.expectedOutcomes.modelAware.patients.some((patient) => patient.reason === "displaced_by_higher_priority")).toBe(true);
  });

  it("includes rejection, resource loss, duplicate idempotency and fallback closure cases", () => {
    const rejection = scenario("S3");
    expect(rejection.expectedOutcomes.modelAware.logs.some((event) => event.event === "hospital_rejection")).toBe(true);
    const loss = scenario("S4");
    expect(loss.inputs.events.some((event) => event.kind === "resource_loss")).toBe(true);
    const duplicate = scenario("S5");
    expect(duplicate.inputs.scenarioNotes.duplicateIdempotencyResult).toBeTruthy();
    const fallback = scenario("S6");
    expect(fallback.inputs.scenarioNotes.forecasterFallback).toBe(true);
    expect(fallback.inputs.events.some((event) => event.kind === "closure_start")).toBe(true);
  });
});
