import test from "node:test";
import assert from "node:assert/strict";
import { distanceKm, rankHospitals } from "../lib/ranking.mjs";

const hospitals = [
  { id: "near", name: "Near General", location: { type: "Point", coordinates: [0.01, 0] }, status: "active" },
  { id: "fit", name: "Specialist Center", location: { type: "Point", coordinates: [0.1, 0] }, status: "active" },
  { id: "full", name: "Full Hospital", location: { type: "Point", coordinates: [0.005, 0] }, status: "full" },
  { id: "other", name: "Other Hospital", location: { type: "Point", coordinates: [0.2, 0] }, status: "active" },
];

test("distance uses GeoJSON longitude, latitude order and returns kilometers", () => {
  assert.ok(Math.abs(distanceKm({ latitude: 0, longitude: 0 }, [1, 0]) - 111.195) < 0.1);
});

test("ranks emergency resource fit alongside distance and returns no more than three", () => {
  const ranked = rankHospitals({
    emergencyType: "cardiac",
    ambulanceLocation: { latitude: 0, longitude: 0 },
    hospitals,
    resources: [
      { hospitalId: "near", type: "bed", category: "general", availableQuantity: 2, status: "available" },
      { hospitalId: "fit", type: "specialist", category: "cardiologist", availableQuantity: 1, status: "available" },
      { hospitalId: "fit", type: "equipment", category: "defibrillator", availableQuantity: 1, status: "available" },
      { hospitalId: "fit", type: "bed", category: "icu", availableQuantity: 1, status: "available" },
      { hospitalId: "full", type: "specialist", category: "cardiologist", availableQuantity: 1, status: "available" },
      { hospitalId: "full", type: "equipment", category: "defibrillator", availableQuantity: 1, status: "available" },
      { hospitalId: "full", type: "bed", category: "icu", availableQuantity: 1, status: "available" },
    ],
  });

  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].hospitalId, "fit");
  assert.deepEqual(ranked[0].matchedNeeds, ["cardiologist", "defibrillator", "icu"]);
  assert.ok(ranked.find((hospital) => hospital.hospitalId === "full").score < ranked[0].score);
});

test("ignores unavailable resources when computing emergency fit", () => {
  const ranked = rankHospitals({
    emergencyType: "trauma",
    ambulanceLocation: { latitude: 0, longitude: 0 },
    hospitals: hospitals.slice(0, 2),
    resources: [
      { hospitalId: "near", type: "specialist", category: "trauma_surgeon", availableQuantity: 1, status: "unavailable" },
      { hospitalId: "fit", type: "specialist", category: "trauma_surgeon", availableQuantity: 1, status: "available" },
      { hospitalId: "fit", type: "bed", category: "emergency", availableQuantity: 1, status: "available" },
      { hospitalId: "fit", type: "bed", category: "icu", availableQuantity: 1, status: "available" },
    ],
  });

  assert.equal(ranked[0].hospitalId, "fit");
  assert.deepEqual(ranked[1].matchedNeeds, []);
});
