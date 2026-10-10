import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (process.loadEnvFile) {
  try {
    process.loadEnvFile(".env");
  } catch {}
}
process.env.HOLD_DURATION_MS ||= "3000";

const {
  requestBedHold,
  cancelPatientBedHold,
  confirmPatientBedHold,
  rejectPatientBedHold,
} = await import("../lib/services/hold-service.ts");

const {
  getHoldsCollection,
  getResourcesCollection,
} = await import("../lib/models/db.ts");

const {
  getCellKey,
  getNearbyFacilities,
} = await import("../lib/places.ts");

// Helper to create an isolated test hospital with 1 bed
async function createTestHospital(bedCount = 1) {
  const hospitalId = `test-hosp-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const resourcesCol = await getResourcesCollection();
  const now = new Date();
  await resourcesCol.insertOne({
    hospitalId,
    type: "bed",
    category: "general",
    name: "Standard Bed",
    totalQuantity: bedCount,
    availableQuantity: bedCount,
    heldQuantity: 0,
    status: "available",
    createdAt: now,
    updatedAt: now,
  });
  return hospitalId;
}

test("Rule A & Concurrency: One bed, two patients simultaneous (Promise.all) - exactly one pending, one queued across 100 runs", { timeout: 180000 }, async () => {
  // Repeating the concurrency race condition test 100 times as specified in AGENT_TASKS.md
  const concurrencyRuns = 100;
  for (let i = 0; i < concurrencyRuns; i++) {
    const hospitalId = await createTestHospital(1);
    const p1 = `patient-A-${i}-${randomUUID().slice(0, 6)}`;
    const p2 = `patient-B-${i}-${randomUUID().slice(0, 6)}`;

    const [res1, res2] = await Promise.all([
      requestBedHold({ patientId: p1, hospitalId }),
      requestBedHold({ patientId: p2, hospitalId }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(
      statuses,
      ["pending", "queued"],
      `Run ${i + 1}: Expected exactly one pending and one queued, but got ${res1.status} and ${res2.status}`,
    );

    const holdsCol = await getHoldsCollection();
    const activeHolds = await holdsCol.find({ hospitalId, status: { $in: ["pending", "queued"] } }).toArray();
    assert.equal(activeHolds.length, 2, `Run ${i + 1}: Expected 2 active holds in database`);
    const pendingInDb = activeHolds.filter((h) => h.status === "pending");
    const queuedInDb = activeHolds.filter((h) => h.status === "queued");
    assert.equal(pendingInDb.length, 1, `Run ${i + 1}: Never allow two pending holds for one bed`);
    assert.equal(queuedInDb.length, 1, `Run ${i + 1}: Fallback must be queued`);
  }
});

test("Rule B: First patient rejected -> second becomes pending automatically", async () => {
  const hospitalId = await createTestHospital(1);
  const p1 = `patient-1-${randomUUID().slice(0, 6)}`;
  const p2 = `patient-2-${randomUUID().slice(0, 6)}`;

  const res1 = await requestBedHold({ patientId: p1, hospitalId });
  const res2 = await requestBedHold({ patientId: p2, hospitalId });

  assert.equal(res1.status, "pending");
  assert.equal(res2.status, "queued");

  const hold1Id = String(res1.hold._id ?? res1.hold.id);
  const rejectRes = await rejectPatientBedHold({ holdId: hold1Id, hospitalId });
  assert.equal(rejectRes.success, true);
  assert.ok(rejectRes.promotedHold, "Second patient must be automatically promoted");
  assert.equal(rejectRes.promotedHold.patientId, p2);
  assert.equal(rejectRes.promotedHold.status, "pending");

  const holdsCol = await getHoldsCollection();
  const p2Hold = await holdsCol.findOne({ hospitalId, patientId: p2 });
  assert.equal(p2Hold?.status, "pending");
  assert.ok(p2Hold?.expiresAt && p2Hold.expiresAt > new Date(), "Promoted hold has fresh expiresAt");
});

test("Rule B: First patient hold expires within seconds -> second promoted", { timeout: 10000 }, async () => {
  const hospitalId = await createTestHospital(1);
  const p1 = `patient-1-${randomUUID().slice(0, 6)}`;
  const p2 = `patient-2-${randomUUID().slice(0, 6)}`;

  const res1 = await requestBedHold({ patientId: p1, hospitalId });
  const res2 = await requestBedHold({ patientId: p2, hospitalId });
  assert.equal(res1.status, "pending");
  assert.equal(res2.status, "queued");

  await new Promise((resolve) => setTimeout(resolve, 3200));
  const holdsCol = await getHoldsCollection();
  const expiredHold = await holdsCol.findOne({ _id: res1.hold._id });
  const p2Hold = await holdsCol.findOne({ hospitalId, patientId: p2 });
  assert.equal(expiredHold?.status, "expired");
  assert.equal(p2Hold?.status, "pending", "Queued hold must be promoted to pending on expiry");
});

test("Rule B: First patient cancels -> second promoted", async () => {
  const hospitalId = await createTestHospital(1);
  const p1 = `patient-1-${randomUUID().slice(0, 6)}`;
  const p2 = `patient-2-${randomUUID().slice(0, 6)}`;

  const res1 = await requestBedHold({ patientId: p1, hospitalId });
  const res2 = await requestBedHold({ patientId: p2, hospitalId });
  assert.equal(res1.status, "pending");
  assert.equal(res2.status, "queued");

  const hold1Id = String(res1.hold._id ?? res1.hold.id);
  const cancelRes = await cancelPatientBedHold({ holdId: hold1Id, patientId: p1 });
  assert.equal(cancelRes.success, true);
  assert.ok(cancelRes.promotedHold, "Cancelling must trigger promoteNext");
  assert.equal(cancelRes.promotedHold.patientId, p2);
  assert.equal(cancelRes.promotedHold.status, "pending");
});

test("Rule A: Same patient, same hospital twice -> second call returns 409, one record exists", async () => {
  const hospitalId = await createTestHospital(2);
  const patientId = `patient-duplicate-${randomUUID().slice(0, 6)}`;

  const res1 = await requestBedHold({ patientId, hospitalId });
  assert.equal(res1.success, true);
  assert.equal(res1.status, "pending");

  const res2 = await requestBedHold({ patientId, hospitalId });
  assert.equal(res2.success, false);
  assert.equal(res2.status, 409);
  assert.equal(res2.duplicate, true);

  const holdsCol = await getHoldsCollection();
  const count = await holdsCol.countDocuments({ hospitalId, patientId });
  assert.equal(count, 1, "Only one hold record must exist in DB for this patient at this hospital");
});

test("Rule A: Same patient, two different hospitals -> both succeed", async () => {
  const hospA = await createTestHospital(1);
  const hospB = await createTestHospital(1);
  const patientId = `multi-patient-${randomUUID().slice(0, 6)}`;

  const resA = await requestBedHold({ patientId, hospitalId: hospA });
  const resB = await requestBedHold({ patientId, hospitalId: hospB });

  assert.equal(resA.success, true);
  assert.equal(resA.status, "pending");
  assert.equal(resB.success, true);
  assert.equal(resB.status, "pending");
});

test("Rule C: Confirm at one hospital -> patient other active requests cancelled and their queues advance", async () => {
  const hospA = await createTestHospital(1);
  const hospB = await createTestHospital(1);
  const targetPatient = `target-patient-${randomUUID().slice(0, 6)}`;
  const competitorPatient = `competitor-patient-${randomUUID().slice(0, 6)}`;

  // Target patient requests both Hospital A and Hospital B
  const reqA = await requestBedHold({ patientId: targetPatient, hospitalId: hospA });
  const reqB = await requestBedHold({ patientId: targetPatient, hospitalId: hospB });
  assert.equal(reqA.status, "pending");
  assert.equal(reqB.status, "pending");

  // Competitor patient requests Hospital B and ends up queued behind target patient
  const reqCompB = await requestBedHold({ patientId: competitorPatient, hospitalId: hospB });
  assert.equal(reqCompB.status, "queued");

  // Hospital A confirms target patient
  const holdAId = String(reqA.hold._id ?? reqA.hold.id);
  const confirmRes = await confirmPatientBedHold({ holdId: holdAId, hospitalId: hospA });
  assert.equal(confirmRes.success, true);

  const holdsCol = await getHoldsCollection();

  // Target patient's request at Hospital A is confirmed
  const holdAInDb = await holdsCol.findOne({ _id: reqA.hold._id });
  assert.equal(holdAInDb?.status, "confirmed");

  // Target patient's request at Hospital B MUST be cancelled (Rule C)
  const holdBInDb = await holdsCol.findOne({ _id: reqB.hold._id });
  assert.equal(holdBInDb?.status, "cancelled", "Rule C: other hospital active request cancelled");

  // Competitor patient's queued request at Hospital B MUST be automatically promoted to pending!
  const compHoldB = await holdsCol.findOne({ _id: reqCompB.hold._id });
  assert.equal(compHoldB?.status, "pending", "Rule C: hospital B queue advanced to pending");
});

test("Rule B: Three patients, one bed -> FIFO order preserved by monotonic sequence", async () => {
  const hospitalId = await createTestHospital(1);
  const p1 = `fifo-p1-${randomUUID().slice(0, 6)}`;
  const p2 = `fifo-p2-${randomUUID().slice(0, 6)}`;
  const p3 = `fifo-p3-${randomUUID().slice(0, 6)}`;

  const res1 = await requestBedHold({ patientId: p1, hospitalId });
  const res2 = await requestBedHold({ patientId: p2, hospitalId });
  const res3 = await requestBedHold({ patientId: p3, hospitalId });

  assert.equal(res1.status, "pending");
  assert.equal(res2.status, "queued");
  assert.equal(res2.queuePosition, 1);
  assert.equal(res3.status, "queued");
  assert.equal(res3.queuePosition, 2);

  assert.ok(res1.hold.seq < res2.hold.seq);
  assert.ok(res2.hold.seq < res3.hold.seq);

  // Reject p1 -> p2 gets promoted first (lowest seq)
  const rejectRes1 = await rejectPatientBedHold({ holdId: String(res1.hold._id), hospitalId });
  assert.equal(rejectRes1.promotedHold?.patientId, p2);

  // Reject p2 -> p3 gets promoted
  const rejectRes2 = await rejectPatientBedHold({ holdId: String(rejectRes1.promotedHold._id), hospitalId });
  assert.equal(rejectRes2.promotedHold?.patientId, p3);
});

test("Rule C: Confirming the last bed closes queued requests with no_beds and notifies patients", async () => {
  const hospitalId = await createTestHospital(1);
  const p1 = `last-bed-${randomUUID().slice(0, 6)}`;
  const p2 = `queued-last-bed-${randomUUID().slice(0, 6)}`;
  const first = await requestBedHold({ patientId: p1, hospitalId });
  const queued = await requestBedHold({ patientId: p2, hospitalId });
  assert.equal(first.status, "pending");
  assert.equal(queued.status, "queued");

  const result = await confirmPatientBedHold({ holdId: String(first.hold._id), hospitalId });
  assert.equal(result.success, true);

  const holdsCol = await getHoldsCollection();
  const queuedInDb = await holdsCol.findOne({ _id: queued.hold._id });
  assert.equal(queuedInDb?.status, "rejected");
  assert.equal(queuedInDb?.reason, "no_beds");

  const { getDb } = await import("../lib/models/db.ts");
  const notifications = (await getDb()).collection("notifications");
  const notification = await notifications.findOne({ recipientId: p2, relatedRequestId: String(queued.hold._id) });
  assert.ok(notification, "Patient must receive a no-beds notification");
});

test("Rule C: Concurrent confirmations at different hospitals allow only one per patient", async () => {
  const hospA = await createTestHospital(1);
  const hospB = await createTestHospital(1);
  const patientId = `confirm-race-${randomUUID().slice(0, 6)}`;
  const [reqA, reqB] = await Promise.all([
    requestBedHold({ patientId, hospitalId: hospA }),
    requestBedHold({ patientId, hospitalId: hospB }),
  ]);
  const [confirmA, confirmB] = await Promise.all([
    confirmPatientBedHold({ holdId: String(reqA.hold._id), hospitalId: hospA }),
    confirmPatientBedHold({ holdId: String(reqB.hold._id), hospitalId: hospB }),
  ]);
  assert.equal([confirmA, confirmB].filter((result) => result.success).length, 1);
  assert.equal([confirmA, confirmB].filter((result) => !result.success && result.status === 409).length, 1);
});

test("Task 5: Places caching and facility registered vs unregistered separation", async () => {
  // Test cell key calculation
  const key1 = getCellKey(28.6139, 77.2090, "hospital");
  const key2 = getCellKey(28.6141, 77.2089, "hospital");
  assert.equal(key1, key2, "Coordinates in same ~1.1km cell must produce the same cache key");

  // Test getNearbyFacilities separates registered and unregistered without leaking beds or doctors to unregistered
  const result = await getNearbyFacilities({ lat: 28.6139, lng: 77.2090, radiusMeters: 5000 });
  assert.ok(Array.isArray(result.registered));
  assert.ok(Array.isArray(result.unregistered));

  for (const reg of result.registered) {
    assert.equal(reg.registered, true);
    assert.equal(reg.label, "Live data");
    assert.ok(reg.beds !== undefined, "Registered facilities show beds from DB");
    assert.ok(reg.doctors !== undefined, "Registered facilities show doctors count from DB");
  }

  for (const unreg of result.unregistered) {
    assert.equal(unreg.registered, false);
    assert.equal(unreg.label, "Not registered — availability unknown, call to confirm");
    assert.equal(unreg.beds, undefined, "Never show bed counts for unregistered facilities");
    assert.equal(unreg.doctors, undefined, "Never show doctors for unregistered facilities");
    assert.equal(unreg.status, undefined, "Never show available status for unregistered facilities");
  }
});
