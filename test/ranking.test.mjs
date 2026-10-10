import test from "node:test";
import assert from "node:assert/strict";
import { rankHospitals } from "../lib/ranking.ts";

const now = new Date("2026-09-25T00:00:00.000Z");
const fakeHospitals = [
  { id: "near", name: "Near General", location: { type: "Point", coordinates: [0, 0] }, status: "active", travelTimeMinutes: 12, resources: [{ category: "icu", availableQuantity: 3, updatedAt: now }, { category: "ventilator", availableQuantity: 1, updatedAt: now }] },
  { id: "far", name: "Far General", location: { type: "Point", coordinates: [1, 1] }, status: "active", travelTimeMinutes: 48, resources: [{ category: "icu", availableQuantity: 2, updatedAt: new Date("2026-09-20T00:00:00.000Z") }] },
  { id: "missing", name: "No Match", location: { type: "Point", coordinates: [2, 2] }, status: "busy", travelTimeMinutes: 5, resources: [{ category: "pediatric", availableQuantity: 1, updatedAt: now }] },
  { id: "inactive", name: "Inactive", location: { type: "Point", coordinates: [0, 0] }, status: "inactive", travelTimeMinutes: 1, resources: [{ category: "icu", availableQuantity: 8, updatedAt: now }] },
];

test("ranks eligible hospitals with resource fit, travel time, freshness, and availability breakdown", () => {
  const ranked = rankHospitals(fakeHospitals, { emergencyType: "other", requiredResources: ["icu"], preferredResources: ["ventilator"], ambulanceLocation: { latitude: 0, longitude: 0 } }, { now });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].hospitalId, "near");
  assert.deepEqual(ranked[0].matchedResources, ["icu", "ventilator"]);
  assert.equal(ranked[0].scoreBreakdown.resourceMatch, 1);
  assert.equal(ranked[1].scoreBreakdown.resourceMatch, 0.5);
  assert.ok(ranked.every((item) => typeof item.score === "number" && item.score >= 0 && item.score <= 100));
  assert.ok(ranked.every((item) => item.hospitalId !== "inactive"));
});

test("returns no more than three candidates and validates configured weights", () => {
  assert.equal(rankHospitals(fakeHospitals, { emergencyType: "icu", ambulanceLocation: { latitude: 0, longitude: 0 } }, { now, limit: 99 }).length, 2);
  assert.throws(() => rankHospitals(fakeHospitals, { emergencyType: "icu", ambulanceLocation: { latitude: 0, longitude: 0 } }, { weights: { resourceMatch: 0, travelTime: 0, freshness: 0, availability: 0 } }), RangeError);
});

test("custom weights are normalized and determine order", () => {
  const candidates = [fakeHospitals[0], { ...fakeHospitals[2], travelTimeMinutes: 40 }];
  const input = { emergencyType: "other", requiredResources: [], preferredResources: ["pediatric"], ambulanceLocation: { latitude: 0, longitude: 0 } };
  const resourceHeavy = rankHospitals(candidates, input, {
    now, weights: { resourceMatch: 10, travelTime: 0, freshness: 0, availability: 0 },
  });
  assert.equal(resourceHeavy[0].hospitalId, "missing");
  assert.equal(resourceHeavy[0].score, 80);
  const travelHeavy = rankHospitals(candidates, input, {
    now, weights: { resourceMatch: 0, travelTime: 1, freshness: 0, availability: 0 },
  });
  assert.equal(travelHeavy[0].hospitalId, "near");
});

test("adding an optional facility preference changes the order predictably", () => {
  const candidates = [
    { ...fakeHospitals[0], id: "close", travelTimeMinutes: 5, resources: [{ category: "icu", availableQuantity: 2, updatedAt: now }] },
    { ...fakeHospitals[1], id: "equipped", travelTimeMinutes: 40, resources: [{ category: "icu", availableQuantity: 2, updatedAt: now }, { category: "pediatric", availableQuantity: 2, updatedAt: now }] },
  ];
  const base = { emergencyType: "other", requiredResources: ["icu"], ambulanceLocation: { latitude: 0, longitude: 0 } };
  assert.equal(rankHospitals(candidates, base, { now })[0].hospitalId, "close");
  assert.equal(rankHospitals(candidates, { ...base, preferredResources: ["pediatric"] }, { now })[0].hospitalId, "equipped");
});

test("aliases, unavailable inventory, and empty results are handled", () => {
  const hospital = { ...fakeHospitals[0], resources: [
    { category: "intensive care", availableQuantity: 2, updatedAt: now },
    { category: "ventilators", availableQuantity: 0, updatedAt: now },
  ] };
  const ranked = rankHospitals([hospital], { emergencyType: "other", requiredResources: ["icu"], preferredResources: ["ventilator"], ambulanceLocation: { latitude: 0, longitude: 0 } }, { now });
  assert.deepEqual(ranked[0].matchedResources, ["icu"]);
  assert.deepEqual(ranked[0].missingResources, ["ventilator"]);
  assert.deepEqual(rankHospitals([], { emergencyType: "trauma", ambulanceLocation: { latitude: 0, longitude: 0 } }), []);
  assert.deepEqual(rankHospitals(fakeHospitals, { emergencyType: "other", requiredResources: [], ambulanceLocation: { latitude: 0, longitude: 0 } }, { now }), []);
});

test("required resources gate ineligible hospitals while queueable bed records remain eligible", () => {
  const unavailableBed = { ...fakeHospitals[2], resources: [{ type: "bed", category: "icu", availableQuantity: 0, updatedAt: now }] };
  const wrongFacility = { ...fakeHospitals[0], resources: [{ type: "specialist", category: "pediatrician", availableQuantity: 1, updatedAt: now }] };
  const results = rankHospitals([unavailableBed, wrongFacility], { emergencyType: "other", requiredResources: ["icu"], ambulanceLocation: { latitude: 0, longitude: 0 } }, { now });
  assert.deepEqual(results.map((result) => result.hospitalId), ["missing"]);
  assert.deepEqual(results[0].missingResources, ["icu"]);
});

test("missing data receives no freshness or travel credit and duplicate/tied hospitals are deterministic", () => {
  const candidates = [
    { ...fakeHospitals[0], id: "z", name: "Same", travelTimeMinutes: undefined, resources: [{ category: "icu", availableQuantity: 1 }] },
    { ...fakeHospitals[0], id: "a", name: "Same", travelTimeMinutes: undefined, resources: [{ category: "icu", availableQuantity: 1 }] },
    { ...fakeHospitals[0], id: "a", name: "Duplicate", travelTimeMinutes: 0, resources: [{ category: "icu", availableQuantity: 1, updatedAt: now }] },
  ];
  const results = rankHospitals(candidates, { emergencyType: "other", requiredResources: ["icu"], ambulanceLocation: { latitude: 0, longitude: 0 } }, { now });
  assert.deepEqual(results.map((result) => result.hospitalId), ["a", "z"]);
  assert.equal(results[0].scoreBreakdown.travelTime, 0);
  assert.equal(results[0].scoreBreakdown.freshness, 0);
  for (const result of results) {
    const contributionTotal = result.scoreContributions.resourceMatch + result.scoreContributions.travelTime + result.scoreContributions.freshness + result.scoreContributions.availability - result.scoreContributions.statusPenalty;
    assert.ok(Math.abs(contributionTotal - result.score) < 0.02);
  }
});

test("only requested facilities contribute capacity and freshness", () => {
  const candidate = {
    ...fakeHospitals[0],
    resources: [
      { category: "icu", availableQuantity: 1 },
      { category: "irrelevant_oxygen", availableQuantity: 100, updatedAt: now },
    ],
  };
  const result = rankHospitals([candidate], {
    emergencyType: "other", requiredResources: ["icu"], ambulanceLocation: { latitude: 0, longitude: 0 },
  }, { now, weights: { resourceMatch: 0, travelTime: 0, freshness: 50, availability: 50 } })[0];
  assert.equal(result.scoreBreakdown.freshness, 0);
  assert.equal(result.scoreBreakdown.availability, 1 / 3);
  assert.equal(result.score, 16.67);
});

test("the normalized weighted formula produces the documented score", () => {
  const candidate = {
    ...fakeHospitals[0], travelTimeMinutes: 30,
    resources: [{ category: "icu", availableQuantity: 3, updatedAt: now }],
  };
  const result = rankHospitals([candidate], {
    emergencyType: "other", requiredResources: ["icu"], ambulanceLocation: { latitude: 0, longitude: 0 },
  }, { now, weights: { resourceMatch: 45, travelTime: 25, freshness: 20, availability: 10 } })[0];
  assert.equal(result.score, 87.5);
  assert.deepEqual(result.scoreContributions, {
    resourceMatch: 45, travelTime: 12.5, freshness: 20, availability: 10, statusPenalty: 0,
  });
});

test("busy status applies a transparent penalty and all scores stay normalized", () => {
  const candidate = { ...fakeHospitals[0], status: "busy", travelTimeMinutes: 30,
    resources: [{ category: "icu", availableQuantity: 3, updatedAt: now }] };
  const result = rankHospitals([candidate], {
    emergencyType: "other", requiredResources: ["icu"], ambulanceLocation: { latitude: 0, longitude: 0 },
  }, { now, weights: { resourceMatch: 45, travelTime: 25, freshness: 20, availability: 10 } })[0];
  assert.equal(result.score, 70);
  assert.equal(result.scoreContributions.statusPenalty, 17.5);
  assert.ok(result.score >= 0 && result.score <= 100);
});
