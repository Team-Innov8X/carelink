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

test("ranks fake hospitals with resource fit, travel time, freshness, and availability breakdown", () => {
  const ranked = rankHospitals(fakeHospitals, { emergencyType: "respiratory", requiredResources: ["icu", "ventilator"], ambulanceLocation: { latitude: 0, longitude: 0 } }, { now });
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].hospitalId, "near");
  assert.deepEqual(ranked[0].matchedResources, ["icu", "ventilator"]);
  assert.equal(ranked[0].scoreBreakdown.resourceMatch, 1);
  assert.equal(ranked[1].scoreBreakdown.resourceMatch, 0.5);
  assert.ok(ranked.every((item) => typeof item.score === "number" && item.score >= 0 && item.score <= 100));
  assert.ok(ranked.every((item) => item.hospitalId !== "inactive"));
});

test("returns no more than three candidates and validates configured weights", () => {
  assert.equal(rankHospitals(fakeHospitals, { emergencyType: "icu", ambulanceLocation: { latitude: 0, longitude: 0 } }, { now, limit: 99 }).length, 3);
  assert.throws(() => rankHospitals(fakeHospitals, { emergencyType: "icu", ambulanceLocation: { latitude: 0, longitude: 0 } }, { weights: { resourceMatch: 0, travelTime: 0, freshness: 0, availability: 0 } }), RangeError);
});
