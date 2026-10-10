import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../components/hospitals/SmartRecommendations.tsx", import.meta.url), "utf8");

test("Smart Match exposes accessible loading, success, empty, and error states", () => {
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /Top Matches/);
  assert.match(source, /No eligible hospitals matched/);
  assert.match(source, /No matching medicine records were found/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Retry search/);
});

test("Smart Match indicates Gemini criteria and data-grounded explanation states", () => {
  assert.match(source, /criteriaSource === 'gemini'/);
  assert.match(source, /data-grounded explanation/);
  assert.match(source, /Availability unverified/);
});

