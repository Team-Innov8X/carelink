import { describe, expect, it } from "vitest";
import { expectedReleasesWithinEta } from "../sim/features.ts";

describe("decision-time release estimate", () => {
  it("uses elapsed stays and the training survival distribution only", () => {
    const expected = expectedReleasesWithinEta([50, 390], [100, 200, 400, 800], 100);
    expect(expected).toBeCloseTo(0.75, 12);
  });

  it("returns zero when no current patients or no training durations are available", () => {
    expect(expectedReleasesWithinEta([], [100, 200], 60)).toBe(0);
    expect(expectedReleasesWithinEta([50], [], 60)).toBe(0);
  });
});
