import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probabilityFromFeatureVector, type LogisticModelArtifact } from "../lib/allocation/forecaster.ts";

interface ParityVector { id: string; featureVector: number[]; probability: number }

describe("runtime forecaster parity", () => {
  it("matches the training probabilities for 20 saved validation vectors", () => {
    const root = process.cwd();
    const model = JSON.parse(readFileSync(join(root, "model", "model.json"), "utf8")) as LogisticModelArtifact;
    const parity = JSON.parse(readFileSync(join(root, "model", "parity-vectors.json"), "utf8")) as ParityVector[];
    expect(parity).toHaveLength(20);
    for (const vector of parity) expect(probabilityFromFeatureVector(vector.featureVector, model)).toBeCloseTo(vector.probability, 12);
  });
});
