import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ACCEPTANCE_FEATURE_ORDER } from "../sim/acceptance-world.ts";
import { scoreAcceptance, type AcceptanceModelArtifact } from "../lib/recommend/accept-model.ts";

describe("acceptance runtime scorer", () => {
  it("matches all 20 saved training probabilities", async () => {
    const model = JSON.parse(await readFile("model/accept-model.json", "utf8")) as AcceptanceModelArtifact;
    expect(model.featureOrder).toEqual([...ACCEPTANCE_FEATURE_ORDER]);
    expect(model.parityVectors).toHaveLength(20);
    for (const row of model.parityVectors) expect(scoreAcceptance(row.featureVector, model)).toBeCloseTo(row.probability, 12);
  });
});
