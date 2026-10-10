import test from "node:test";
import assert from "node:assert/strict";
import { createRankHandler } from "../lib/rank-handler.ts";
import { rankHospitals } from "../lib/ranking.ts";
import { buildMatchExplanation } from "../lib/smart-match-explanation.ts";

const hospitals = [
  { id: "hospital-a", code: "HA", name: "North Clinic", status: "active", location: { type: "Point", coordinates: [77.59, 12.97] } },
  { id: "hospital-b", code: "HB", name: "Central Hospital", status: "active", location: { type: "Point", coordinates: [77.60, 12.98] } },
];
const resources = [
  { id: "icu-a", hospitalId: "hospital-a", type: "bed", category: "icu", totalQuantity: 4, availableQuantity: 2, confirmedQuantity: 1, heldQuantity: 1, status: "available", updatedAt: new Date() },
  { id: "vent-a", hospitalId: "hospital-a", type: "equipment", category: "ventilator", totalQuantity: 1, availableQuantity: 0, heldQuantity: 0, status: "unavailable", updatedAt: new Date() },
  { id: "icu-b", hospitalId: "hospital-b", type: "bed", category: "icu", totalQuantity: 5, availableQuantity: 4, confirmedQuantity: 1, heldQuantity: 0, status: "available", updatedAt: new Date() },
  { id: "vent-b", hospitalId: "hospital-b", type: "equipment", category: "ventilator", totalQuantity: 2, availableQuantity: 1, heldQuantity: 0, status: "available", updatedAt: new Date() },
];
const doctors = [{ hospitalId: "hospital-b", specialization: "cardiologist", updatedAt: new Date() }];
const body = {
  emergencyType: "cardiac care",
  requiredResources: ["icu"],
  preferredResources: ["ventilator"],
  ambulanceLocation: { latitude: 12.97, longitude: 77.59 },
  maxTravelMinutes: 60,
  limit: 20,
};
const request = (payload = body) => new Request("http://localhost/api/rank", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
});
const makeHandler = (overrides = {}) => {
  const deps = {
    authorize: async () => ({ authorized: true }),
    expirePendingHolds: async () => {},
    loadData: async () => ({ hospitals, resources, doctors, settings: null }),
    addTravelTimes: async (records) => records.map((hospital) => ({ ...hospital, travelTimeMinutes: hospital.id === "hospital-a" ? 8 : 14 })),
    rankHospitals,
    ...overrides,
  };
  return createRankHandler(deps);
};

test("rank API maps database records, filters inventory, computes reasons, and ranks candidates", async () => {
  let loads = 0;
  const handler = makeHandler({ loadData: async () => { loads += 1; return { hospitals, resources, doctors, settings: null }; } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(loads, 1);
  const result = await response.json();
  assert.deepEqual(result.ranked.map((item) => item.hospitalId), ["hospital-b", "hospital-a"]);
  assert.deepEqual(result.rankingWeights, { resourceMatch: 45, travelTime: 25, freshness: 20, availability: 10 });
  const best = result.ranked[0];
  assert.ok(best.score >= 0 && best.score <= 100);
  assert.ok(best.matchedResources.includes("icu"));
  assert.ok(best.matchedResources.includes("ventilator"));
  assert.equal(best.resources.find((resource) => resource.id === "icu-b").availableQuantity, 4);
  assert.equal(best.scoreBreakdown.resourceMatch, 1);
  assert.equal(best.distanceKm > 0, true);
  const explanation = buildMatchExplanation(best);
  assert.match(explanation, /Available matching needs: icu, ventilator\./);
  assert.match(explanation, /relevant available capacity \d+%/);
  assert.match(explanation, /Weighted score points:/);
  assert.ok(explanation.includes(`${best.score.toFixed(2)}/100`));
  assert.doesNotMatch(explanation, /cardiologist/);
});

test("rank API preserves capacity weight when applying a travel priority", async () => {
  let receivedWeights;
  const handler = makeHandler({ rankHospitals: (records, criteria, options) => { receivedWeights = options.weights; return rankHospitals(records, criteria, options); } });
  const response = await handler(request({ ...body, priority: "travel" }));
  assert.equal(response.status, 200);
  assert.deepEqual(receivedWeights, { resourceMatch: 18, travelTime: 58.5, freshness: 13.5, availability: 10 });
});

test("rank API applies hard travel eligibility before limiting the result list", async () => {
  const handler = makeHandler();
  const response = await handler(request({ ...body, maxTravelMinutes: 10, limit: 1 }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).ranked.map((item) => item.hospitalId), ["hospital-a"]);
});

test("rank API rejects invalid search data before loading records", async () => {
  let loads = 0;
  const handler = makeHandler({ loadData: async () => { loads += 1; return { hospitals, resources, doctors, settings: null }; } });
  const response = await handler(request({ ...body, ambulanceLocation: { latitude: 91, longitude: 0 } }));
  assert.equal(response.status, 400);
  assert.equal(loads, 0);
});

test("rank API requires an authorized role before querying records", async () => {
  let loads = 0;
  const handler = makeHandler({ authorize: async () => ({ authorized: false, reason: "UNAUTHENTICATED" }), loadData: async () => { loads += 1; return { hospitals, resources, doctors, settings: null }; } });
  const response = await handler(request());
  assert.equal(response.status, 401);
  assert.equal(loads, 0);
});

test("rank API returns an empty result for no eligible hospitals and a safe error for DB failures", async () => {
  const emptyHandler = makeHandler({ loadData: async () => ({ hospitals: [], resources: [], doctors: [], settings: null }) });
  const empty = await emptyHandler(request());
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).ranked, []);

  const failingHandler = makeHandler({ loadData: async () => { throw new Error("private database detail"); } });
  const failed = await failingHandler(request());
  assert.equal(failed.status, 500);
  assert.equal((await failed.text()).includes("private database detail"), false);
});

test("rank API rejects malformed JSON without querying records", async () => {
  let loads = 0;
  const handler = makeHandler({ loadData: async () => { loads += 1; return { hospitals, resources, doctors, settings: null }; } });
  const response = await handler(new Request("http://localhost/api/rank", { method: "POST", body: "{" }));
  assert.equal(response.status, 400);
  assert.equal(loads, 0);
});
