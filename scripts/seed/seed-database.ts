import { ObjectId } from "mongodb";
import { confirmHold, createHold } from "@/lib/services/hold-service";
import { getHoldsCollection, getHospitalsCollection, getResourcesCollection, initializeIndexes } from "@/lib/models";
import { expirePendingHolds, releaseHold } from "@/lib/services/hold-service";

type SeedVariant = "demo" | "stale-low" | "verify";

async function verifyReservationScenarios() {
  await initializeIndexes();
  const hospitals = await getHospitalsCollection();
  const resources = await getResourcesCollection();
  const holds = await getHoldsCollection();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdHospitalIds: string[] = [];
  const createdResourceIds: string[] = [];
  const requestPrefix = `carelink-verify-${suffix}`;
  try {
    const common = {
      address: { street: "Test Route", city: "New Delhi", state: "Delhi", zipCode: "110001", country: "India" },
      location: { type: "Point" as const, coordinates: [77.209 + Math.random() / 1000, 28.6139] as [number, number] },
      contact: { phone: "+91-11-0000-0000", email: "test@carelink.example", emergencyHotline: "+91-11-0000-0001" },
      capacitySummary: { totalBeds: 1, availableBeds: 1, totalVentilators: 0, availableVentilators: 0 },
      status: "active" as const, createdAt: new Date(), updatedAt: new Date(),
    };
    const hospitalDocs = [
      { ...common, name: "CareLink Concurrency Verification", code: `VERIFY-A-${suffix}` },
      { ...common, name: "CareLink Escalation Verification", code: `VERIFY-B-${suffix}`, location: { ...common.location, coordinates: [77.219, 28.623] as [number, number] } },
    ];
    const insertedHospitals = await hospitals.insertMany(hospitalDocs);
    createdHospitalIds.push(...Object.values(insertedHospitals.insertedIds).map((id) => id.toString()));
    const [firstHospitalId, secondHospitalId] = createdHospitalIds;
    const resourcesCreated = await resources.insertMany([
      { hospitalId: firstHospitalId, type: "bed", category: "emergency", name: `Verification bed A ${suffix}`, totalQuantity: 1, availableQuantity: 1, heldQuantity: 0, status: "available" as const, createdAt: new Date(), updatedAt: new Date() },
      { hospitalId: secondHospitalId, type: "bed", category: "emergency", name: `Verification bed B ${suffix}`, totalQuantity: 1, availableQuantity: 1, heldQuantity: 0, status: "available" as const, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const [firstResourceId, secondResourceId] = Object.values(resourcesCreated.insertedIds).map((id) => id.toString());
    createdResourceIds.push(firstResourceId, secondResourceId);
    const params = (hospitalId: string, resourceId: string, userId: string) => ({
      hospitalId, resourceId, resourceType: "bed" as const, category: "emergency",
      requestedByUserId: userId, patientDetails: { name: "Verification Patient", priority: "urgent" as const },
      originLocation: [77.21, 28.62] as [number, number], holdTimeoutMinutes: 15,
    });

    const simultaneous = await Promise.all([
      createHold(params(firstHospitalId, firstResourceId, `${requestPrefix}-a`)),
      createHold(params(firstHospitalId, firstResourceId, `${requestPrefix}-b`)),
    ]);
    const winners = simultaneous.filter((result) => result.success);
    if (winners.length !== 1) throw new Error(`Double-booking verification failed: expected 1 reservation, received ${winners.length}.`);
    const winner = winners[0];
    if (!winner.success || !winner.hold?.id) throw new Error("Double-booking verification did not return the winning hold.");
    const rejection = await releaseHold(winner.hold.id, "rejected", [77.21, 28.62]);
    if (!rejection.success || !rejection.escalatedHold) throw new Error("Rejection escalation verification failed: no fallback hold was created.");
    const fallbackId = (rejection.escalatedHold as { id?: string }).id;
    if (!fallbackId) throw new Error("Escalation verification returned no fallback hold ID.");
    await releaseHold(fallbackId, "cancelled");

    const timeoutHold = await createHold(params(firstHospitalId, firstResourceId, `${requestPrefix}-timeout`));
    if (!timeoutHold.success || !timeoutHold.hold?.id) throw new Error("Timeout verification could not create its initial hold.");
    await holds.updateOne({ _id: new ObjectId(timeoutHold.hold.id) }, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
    const expired = await expirePendingHolds(firstHospitalId);
    const timeoutFallback = expired.find((result) => result.success && result.escalatedHold);
    if (!timeoutFallback?.success || !timeoutFallback.escalatedHold) throw new Error("Timeout escalation verification failed: expiry did not create a fallback hold.");
    const timeoutFallbackId = (timeoutFallback.escalatedHold as { id?: string }).id;
    if (!timeoutFallbackId) throw new Error("Timeout escalation verification returned no fallback hold ID.");
    const confirmation = await confirmHold(timeoutFallbackId, `${requestPrefix}-hospital`);
    const committedResource = (confirmation as { resource?: { availableQuantity: number; heldQuantity: number } }).resource;
    if (!confirmation.success || !committedResource || committedResource.availableQuantity !== 0 || committedResource.heldQuantity !== 0) {
      throw new Error("Confirmation verification failed: accepting a hold did not consume the reserved capacity exactly once.");
    }
    const testHoldIds = await holds.find({ requestedByUserId: { $regex: `^${requestPrefix}` } }, { projection: { _id: 1 } }).toArray();
    await holds.deleteMany({ _id: { $in: testHoldIds.map((hold) => hold._id!).filter(Boolean) } });
    return { doubleBooking: "passed (exactly one simultaneous hold succeeded)", confirmation: "passed (acceptance committed held capacity exactly once)", rejectionEscalation: "passed (fallback hold created)", timeoutEscalation: "passed (expired hold reranked and reserved fallback)" };
  } finally {
    await holds.deleteMany({ requestedByUserId: { $regex: `^${requestPrefix}` } });
    // Also remove escalation holds whose requester was copied from the source.
    await resources.deleteMany({ _id: { $in: createdResourceIds.map((id) => new ObjectId(id)) } });
    await hospitals.deleteMany({ _id: { $in: createdHospitalIds } });
  }
}

export async function seedDatabase(variant: SeedVariant = "demo") {
  if (variant === "verify") return { success: true, variant, scenarios: await verifyReservationScenarios(), message: "MongoDB reservation scenarios passed; temporary verification records were cleaned up." };
  await initializeIndexes();
  const hospitals = await getHospitalsCollection();
  const resources = await getResourcesCollection();
  const holds = await getHoldsCollection();
  const now = new Date();

  const sampleHospitals = [
    {
      name: "City General Hospital", code: "CGH-001",
      address: { street: "100 Medical Center Way", city: "New Delhi", state: "Delhi", zipCode: "110001", country: "India" },
      location: { type: "Point" as const, coordinates: [77.209, 28.6139] as [number, number] },
      contact: { phone: "+91-11-2345-6789", email: "emergency@citygeneral.example", emergencyHotline: "+91-11-2345-6790" },
      capacitySummary: { totalBeds: 150, availableBeds: 24, totalVentilators: 20, availableVentilators: 5 },
      status: "active" as const, createdAt: now, updatedAt: now,
    },
    {
      name: "St. Jude Trauma Center", code: "STJ-002",
      address: { street: "450 Health Parkway", city: "New Delhi", state: "Delhi", zipCode: "110002", country: "India" },
      location: { type: "Point" as const, coordinates: [77.218, 28.628] as [number, number] },
      contact: { phone: "+91-11-8765-4321", email: "trauma@stjude.example", emergencyHotline: "+91-11-8765-4322" },
      capacitySummary: { totalBeds: 200, availableBeds: 8, totalVentilators: 30, availableVentilators: 2 },
      status: "busy" as const, createdAt: now, updatedAt: now,
    },
  ];

  let hospitalsInserted = 0;
  for (const hospital of sampleHospitals) {
    const result = await hospitals.updateOne({ code: hospital.code }, { $setOnInsert: hospital }, { upsert: true });
    hospitalsInserted += result.upsertedCount;
  }
  const savedHospitals = await hospitals.find({ code: { $in: sampleHospitals.map((hospital) => hospital.code) } }).toArray();
  const hospitalByCode = new Map(savedHospitals.map((hospital) => [hospital.code, hospital._id?.toString() ?? ""]));
  const hospital1Id = hospitalByCode.get("CGH-001");
  const hospital2Id = hospitalByCode.get("STJ-002");
  if (!hospital1Id || !hospital2Id) throw new Error("Seed hospitals were not available after upsert.");

  const sampleResources = [
    { hospitalId: hospital1Id, type: "bed" as const, category: "icu", name: "ICU Bed Unit A", description: "Negative pressure intensive care bed with continuous telemetry monitor", totalQuantity: 15, availableQuantity: 6 },
    { hospitalId: hospital1Id, type: "bed" as const, category: "general", name: "General Medical Ward Bed", description: "Acute inpatient monitoring bed", totalQuantity: 80, availableQuantity: 24 },
    { hospitalId: hospital1Id, type: "bed" as const, category: "trauma", name: "Trauma Care Resuscitation Bed", description: "Dedicated acute trauma stabilization bed", totalQuantity: 12, availableQuantity: 4 },
    { hospitalId: hospital1Id, type: "equipment" as const, category: "ventilator", name: "Advanced ICU Ventilator v4", description: "High-frequency oscillatory ventilator", totalQuantity: 10, availableQuantity: 5 },
    { hospitalId: hospital1Id, type: "specialist" as const, category: "cardiologist", name: "Dr. Ananya Sen", specialization: "Cardiology", description: "Senior Interventional Cardiologist", totalQuantity: 1, availableQuantity: 1 },
    { hospitalId: hospital1Id, type: "specialist" as const, category: "emergency_physician", name: "Dr. Rajesh Kumar", specialization: "Emergency Medicine", description: "Head of Emergency Department", totalQuantity: 1, availableQuantity: 1 },
    { hospitalId: hospital1Id, type: "specialist" as const, category: "trauma_surgeon", name: "Dr. Vikram Mehta", specialization: "Trauma Surgery", description: "Lead Trauma Surgeon on active duty", totalQuantity: 1, availableQuantity: 1 },
    { hospitalId: hospital1Id, type: "specialist" as const, category: "intensivist", name: "Dr. Arvind Joshi", specialization: "Critical Care & Pulmonology", description: "Chief ICU Intensivist", totalQuantity: 1, availableQuantity: 1 },
    { hospitalId: hospital2Id, type: "bed" as const, category: "emergency", name: "Emergency Triage Bed", description: "Rapid admission acute trauma bed", totalQuantity: 25, availableQuantity: 8 },
    { hospitalId: hospital2Id, type: "bed" as const, category: "icu", name: "St. Jude Neuro ICU Bed", description: "Continuous intracranial pressure monitoring ICU bed", totalQuantity: 18, availableQuantity: 3 },
    { hospitalId: hospital2Id, type: "specialist" as const, category: "neurologist", name: "Dr. Sunita Rao", specialization: "Neurology", description: "Stroke and Neurotrauma Specialist", totalQuantity: 1, availableQuantity: 1 },
    { hospitalId: hospital2Id, type: "specialist" as const, category: "pediatrician", name: "Dr. Priya Nair", specialization: "Pediatrics", description: "Pediatric Emergency Consultant", totalQuantity: 1, availableQuantity: 1 },
    { hospitalId: hospital2Id, type: "specialist" as const, category: "orthopedics", name: "Dr. Harish Gupta", specialization: "Orthopedics & Joint Care", description: "Consultant Orthopedic Trauma Surgeon", totalQuantity: 1, availableQuantity: 1 },
  ];

  let resourcesInserted = 0;
  for (const resource of sampleResources) {
    const result = await resources.updateOne(
      { hospitalId: resource.hospitalId, type: resource.type, category: resource.category, name: resource.name },
      { $setOnInsert: { ...resource, heldQuantity: 0, status: "available", createdAt: now, updatedAt: now } },
      { upsert: true },
    );
    resourcesInserted += result.upsertedCount;
  }

  let holdsInserted = 0;
  if (variant === "demo") {
    const icuBed = await resources.findOne({ hospitalId: hospital1Id, type: "bed", category: "icu", name: "ICU Bed Unit A" });
    if (icuBed?._id) {
      const existing = await holds.findOne({ notes: "CareLink demo pending hold" });
      if (!existing) {
        const result = await createHold({
          hospitalId: hospital1Id,
          resourceId: icuBed._id.toString(),
          resourceType: "bed",
          category: "icu",
          requestedByUserId: "carelink-demo-dispatcher",
          ambulanceId: "AMB-DEMO-44",
          patientDetails: { name: "Demo Patient", age: 45, conditionSummary: "Acute respiratory distress", priority: "critical", etaMinutes: 12 },
          quantity: 1,
          originLocation: [77.205, 28.61],
          holdTimeoutMinutes: 20,
          notes: "CareLink demo pending hold",
        });
        holdsInserted = result.success ? 1 : 0;
      }
    }
  } else {
    const staleHospital = {
      name: "CareLink Stale Data Scenario", code: "CARELINK-STALE-001",
      address: { street: "1 Test Route", city: "New Delhi", state: "Delhi", zipCode: "110003", country: "India" },
      location: { type: "Point" as const, coordinates: [77.22, 28.62] as [number, number] },
      contact: { phone: "+91-11-0000-0001", email: "test@carelink.example", emergencyHotline: "+91-11-0000-0002" },
      capacitySummary: { totalBeds: 10, availableBeds: 1, totalVentilators: 2, availableVentilators: 0 },
      status: "active" as const, createdAt: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000), updatedAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
    };
    const staleHospitalResult = await hospitals.updateOne({ code: staleHospital.code }, { $setOnInsert: staleHospital }, { upsert: true });
    hospitalsInserted += staleHospitalResult.upsertedCount;
    const savedStale = await hospitals.findOne({ code: staleHospital.code });
    if (!savedStale?._id) throw new Error("Stale scenario hospital was not available after upsert.");
    const staleResource = { hospitalId: savedStale._id.toString(), type: "bed" as const, category: "icu", name: "Stale low-count ICU bed", description: "Test-only stale resource with one remaining unit", totalQuantity: 12, availableQuantity: 1 };
    await resources.updateOne(
      { hospitalId: staleResource.hospitalId, type: staleResource.type, category: staleResource.category, name: staleResource.name },
      { $setOnInsert: { ...staleResource, heldQuantity: 0, status: "available", createdAt: staleHospital.createdAt, updatedAt: staleHospital.updatedAt } },
      { upsert: true },
    );
  }

  return {
    success: true,
    variant,
    message: "Seed data upserted without deleting existing records.",
    hospitalsInserted,
    resourcesInserted,
    holdsInserted,
  };
}
