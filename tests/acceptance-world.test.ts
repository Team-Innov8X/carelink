import { describe, expect, it } from "vitest";
import { acceptanceFeatureVector, deriveAcceptanceLabel, simulateAcceptance, ACCEPTANCE_FEATURE_ORDER } from "../sim/acceptance-world.ts";
import { simulateWorld } from "../sim/world.ts";
import { splitForDay } from "../sim/dataset.ts";

describe("synthetic acceptance world", () => {
  it("is deterministic and keeps features finite and non-negative where applicable", () => {
    const first = simulateAcceptance(simulateWorld(20261011).days, 20261011);
    const second = simulateAcceptance(simulateWorld(20261011).days, 20261011);
    expect(first).toEqual(second);
    expect(first.samples.length).toBe(9600);
    for (const sample of first.samples) {
      expect(sample.features).toHaveLength(ACCEPTANCE_FEATURE_ORDER.length);
      expect(sample.features.every(Number.isFinite)).toBe(true);
      expect(sample.features[0]).toBeGreaterThanOrEqual(0);
      expect(sample.raw.rejectionProbability).toBeGreaterThanOrEqual(0.05);
      expect(sample.raw.rejectionProbability).toBeLessThanOrEqual(0.4);
      expect(deriveAcceptanceLabel(sample.raw)).toBe(sample.label);
      expect(splitForDay(sample.day)).toBe(sample.day <= 30 ? "train" : sample.day <= 40 ? "validation" : "test");
    }
  }, 60_000);

  it("does not expose latent simulator fields through model features", () => {
    const sample = simulateAcceptance(simulateWorld(9).days, 9).samples[0];
    const withDifferentLatentState = { ...sample, raw: { ...sample.raw, surgeActive: !sample.raw.surgeActive, nearClosure: !sample.raw.nearClosure, rejectionProbability: sample.raw.rejectionProbability === 0.4 ? 0.05 : 0.4, draw: 0 } };
    expect(acceptanceFeatureVector(withDifferentLatentState)).toEqual(acceptanceFeatureVector(sample));
  }, 60_000);
});
