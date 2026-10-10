import test from "node:test";
import assert from "node:assert/strict";
import { rankPharmacies } from "../lib/pharmacy-matching.ts";

const now = new Date("2026-10-10T10:00:00Z");
const medicines = [{ id: "med-1", name: "Salbutamol", form: "inhaler", stock: { near: 4, stale: 8, missing: 0 } }];
const pharmacies = [
  { id: "near", name: "Nearby Pharmacy", location: { lat: 12.97, lng: 77.59 } },
  { id: "stale", name: "Old Update Pharmacy", location: { lat: 12.98, lng: 77.59 } },
  { id: "missing", name: "No Update Pharmacy", location: { lat: 13, lng: 77.59 } },
  { id: "far", name: "Outside Radius", location: { lat: 14, lng: 77.59 } },
];
const input = { medicine: "Salbutamol", quantity: 2, origin: { latitude: 12.97, longitude: 77.59 }, radiusKm: 10, limit: 50 };
const updates = [
  { pharmacyId: "near", medicineId: "med-1", newQuantity: 4, createdAt: new Date(now.getTime() - 20 * 60_000) },
  { pharmacyId: "stale", medicineId: "med-1", newQuantity: 8, createdAt: new Date(now.getTime() - 7 * 60 * 60_000) },
];

test("pharmacy matching filters by radius and distinguishes verified, stale, and unknown stock", () => {
  const results = rankPharmacies({ pharmacies, medicines, stockUpdates: updates, input, now });
  assert.deepEqual(results.map((item) => item.pharmacyId), ["near", "stale", "missing"]);
  assert.equal(results[0].availability, "verified_available");
  assert.equal(results[0].eligibleForRequest, true);
  assert.equal(results[0].score, 100);
  assert.equal(results[1].availability, "unverified");
  assert.equal(results[2].availability, "unverified");
  assert.equal(results[1].eligibleForRequest, false);
});

test("verified insufficient quantity fails mandatory ordering eligibility", () => {
  const stockAtOne = [{ ...medicines[0], stock: { ...medicines[0].stock, near: 1 } }];
  const result = rankPharmacies({ pharmacies: [pharmacies[0]], medicines: stockAtOne, stockUpdates: [{ ...updates[0], newQuantity: 1 }], input: { ...input, quantity: 2 }, now })[0];
  assert.equal(result.availability, "verified_unavailable");
  assert.equal(result.eligibleForRequest, false);
});

test("unknown medicine and empty inventory return no matches", () => {
  assert.deepEqual(rankPharmacies({ pharmacies, medicines, stockUpdates: updates, input: { ...input, medicine: "Not in catalog" }, now }), []);
  assert.deepEqual(rankPharmacies({ pharmacies: [], medicines, stockUpdates: [], input, now }), []);
});
