import { NextResponse } from "next/server";
import {
  getHospitalsCollection,
  getResourcesCollection,
  getHoldsCollection,
  initializeIndexes,
} from "@/lib/models";

export async function POST() {
  try {
    await initializeIndexes();

    const hospitalsCol = await getHospitalsCollection();
    const resourcesCol = await getResourcesCollection();
    const holdsCol = await getHoldsCollection();

    // Clear existing sample seed data
    await hospitalsCol.deleteMany({});
    await resourcesCol.deleteMany({});
    await holdsCol.deleteMany({});

    // 1. Insert Sample Hospitals
    const sampleHospitals = [
      {
        name: "City General Hospital",
        code: "CGH-001",
        address: {
          street: "100 Medical Center Way",
          city: "Metropolis",
          state: "NY",
          zipCode: "10001",
          country: "USA",
        },
        location: {
          type: "Point" as const,
          coordinates: [-73.98513, 40.748817] as [number, number],
        },
        contact: {
          phone: "+1-555-0199",
          email: "emergency@citygeneral.org",
          emergencyHotline: "+1-555-9110",
        },
        capacitySummary: {
          totalBeds: 150,
          availableBeds: 24,
          totalVentilators: 20,
          availableVentilators: 5,
        },
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: "St. Jude Trauma Center",
        code: "STJ-002",
        address: {
          street: "450 Health Parkway",
          city: "Metropolis",
          state: "NY",
          zipCode: "10002",
          country: "USA",
        },
        location: {
          type: "Point" as const,
          coordinates: [-73.99123, 40.752101] as [number, number],
        },
        contact: {
          phone: "+1-555-0288",
          email: "trauma@stjude.org",
          emergencyHotline: "+1-555-9112",
        },
        capacitySummary: {
          totalBeds: 200,
          availableBeds: 8,
          totalVentilators: 30,
          availableVentilators: 2,
        },
        status: "busy" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const hospitalRes = await hospitalsCol.insertMany(sampleHospitals);
    const hospital1Id = hospitalRes.insertedIds[0].toString();
    const hospital2Id = hospitalRes.insertedIds[1].toString();

    // 2. Insert Sample Resources (Beds, Equipment, Specialists)
    const sampleResources = [
      // Hospital 1 Resources
      {
        hospitalId: hospital1Id,
        type: "bed" as const,
        category: "icu",
        name: "ICU Bed Unit A",
        description: "Negative pressure intensive care bed with continuous telemetry monitor",
        totalQuantity: 15,
        availableQuantity: 3,
        heldQuantity: 1,
        status: "available" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        hospitalId: hospital1Id,
        type: "equipment" as const,
        category: "ventilator",
        name: "Advanced ICU Ventilator v4",
        description: "High-frequency oscillatory ventilator",
        totalQuantity: 10,
        availableQuantity: 2,
        heldQuantity: 1,
        status: "available" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        hospitalId: hospital1Id,
        type: "specialist" as const,
        category: "trauma_surgeon",
        name: "On-Call Trauma Surgeons",
        description: "Level 1 Trauma Surgical Team on active duty",
        totalQuantity: 4,
        availableQuantity: 2,
        heldQuantity: 0,
        status: "available" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Hospital 2 Resources
      {
        hospitalId: hospital2Id,
        type: "bed" as const,
        category: "emergency",
        name: "Emergency Triage Bed",
        description: "Rapid admission acute trauma bed",
        totalQuantity: 25,
        availableQuantity: 5,
        heldQuantity: 2,
        status: "available" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const resourceRes = await resourcesCol.insertMany(sampleResources);
    const resource1Id = resourceRes.insertedIds[0].toString();

    // 3. Insert Sample Holds / Reservations
    const sampleHolds = [
      {
        hospitalId: hospital1Id,
        resourceId: resource1Id,
        requestedByUserId: "dispatcher-demo-user-id",
        patientDetails: {
          name: "John Doe",
          age: 45,
          gender: "Male",
          conditionSummary: "Acute respiratory distress following MVA",
          priority: "critical" as const,
          etaMinutes: 12,
        },
        quantity: 1,
        status: "pending" as const,
        expiresAt: new Date(Date.now() + 20 * 60 * 1000), // 20 min hold window
        notes: "Ambulance Unit 44 en route",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await holdsCol.insertMany(sampleHolds);

    return NextResponse.json({
      success: true,
      message: "Database successfully seeded with Hospitals, Resources, and Holds!",
      hospitalsInserted: sampleHospitals.length,
      resourcesInserted: sampleResources.length,
      holdsInserted: sampleHolds.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Seeding failed" },
      { status: 500 }
    );
  }
}
