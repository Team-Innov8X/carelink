import { NextResponse } from "next/server";
import { headers } from "next/headers";
import clientPromise from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { INITIAL_HOSPITALS } from "@/data/mockHospitals";
import { INITIAL_EMERGENCIES } from "@/data/mockEmergencies";
import { INITIAL_PHARMACIES } from "@/data/mockPharmacies";
import { INITIAL_MEDICINES } from "@/data/mockMedicines";
import { INITIAL_AMBULANCES } from "@/data/mockAmbulances";
import { INITIAL_DRIVERS } from "@/data/mockDrivers";
import { workflowCollections } from '@/lib/sos';

const defaultState = {
  hospitals: INITIAL_HOSPITALS,
  emergencies: INITIAL_EMERGENCIES,
  pharmacies: INITIAL_PHARMACIES,
  medicines: INITIAL_MEDICINES,
  ambulances: INITIAL_AMBULANCES,
  drivers: INITIAL_DRIVERS,
  medicineOrders: [],
};

const stateCollection = async () => {
  const client = await clientPromise;
  return client.db().collection<{ _id: string; state: Record<string, unknown>; updatedAt?: Date }>("appState");
};

const hasSession = async () => Boolean(await auth.api.getSession({ headers: await headers() }));

export async function GET() {
  if (!(await hasSession())) {
    return NextResponse.json({ error: "Sign in to access shared CareLink data" }, { status: 401 });
  }
  try {
    const collection = await stateCollection();
    const stored = await collection.findOne({ _id: "carelink" });
    if (stored) {
      const state = stored.state as typeof defaultState;
      const { hospitalRequests, hospitalAdmissions } = await workflowCollections();
      const accepted = await hospitalRequests.find({ status: 'accepted' }).project({ _id: 1, hospitalId: 1, bedCategory: 1 }).toArray();
      const activeAdmissions = accepted.length ? await hospitalAdmissions.find({ hospitalRequestId: { $in: accepted.map((item) => item._id) }, dischargedAt: { $exists: false } }).project({ hospitalRequestId: 1 }).toArray() : [];
      const admittedIds = new Set(activeAdmissions.map((item) => item.hospitalRequestId));
      const enrichedHospitals = (state.hospitals ?? []).map((hospital) => {
        const reservedCounts: Record<string, number> = {};
        for (const request of accepted) if (request.hospitalId === hospital.id && request.bedCategory && !admittedIds.has(request._id)) reservedCounts[request.bedCategory] = (reservedCounts[request.bedCategory] ?? 0) + 1;
        const age = hospital.lastCapacityUpdatedAt ? Math.max(0, Math.floor((Date.now() - new Date(hospital.lastCapacityUpdatedAt).getTime()) / 60_000)) : hospital.lastUpdatedMinutesAgo;
        const beds = Object.fromEntries(Object.entries(hospital.beds).map(([key, bed]) => [key, { ...bed, reserved: reservedCounts[key] ?? 0 }]));
        return { ...hospital, beds, lastUpdatedMinutesAgo: age, status: Object.values(beds).some((bed) => bed.available > 0) ? 'Available' : 'Full' };
      });
      return NextResponse.json({ state: { ...state, hospitals: enrichedHospitals }, connected: true });
    }
    await collection.updateOne(
      { _id: "carelink" },
      { $setOnInsert: { state: defaultState, updatedAt: new Date() } },
      { upsert: true },
    );
    const initialized = await collection.findOne({ _id: "carelink" });
    return NextResponse.json({ state: initialized?.state ?? defaultState, connected: true });
  } catch (error) {
    console.error("CareLink database read failed:", error);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!(await hasSession())) {
    return NextResponse.json({ error: "Sign in to update shared CareLink data" }, { status: 401 });
  }
  try {
    const state = await request.json();
    const requiredArrays = ["hospitals", "emergencies", "pharmacies", "medicines", "ambulances", "drivers", "medicineOrders"];
    if (!state || requiredArrays.some((key) => !Array.isArray(state[key]))) {
      return NextResponse.json({ error: "Invalid CareLink state" }, { status: 400 });
    }
    const collection = await stateCollection();
    const current = await collection.findOne({ _id: 'carelink' });
    if (current?.state && Array.isArray(state.hospitals)) {
      const currentState = current.state as { medicines?: unknown[]; medicineOrders?: unknown[] };
      // Inventory and order changes use atomic pharmacy endpoints; preserve them
      // when another portal saves its local dashboard snapshot.
      state.medicines = currentState.medicines ?? state.medicines;
      state.medicineOrders = currentState.medicineOrders ?? state.medicineOrders;
      const currentHospitals = (current.state as { hospitals?: Array<Record<string, unknown>> }).hospitals ?? [];
      const byId = new Map(currentHospitals.map((hospital) => [hospital.id, hospital]));
      state.hospitals = state.hospitals.map((hospital: Record<string, unknown>) => {
        const live = byId.get(hospital.id);
        return live ? { ...hospital, beds: live.beds, specialties: live.specialties ?? hospital.specialties, doctors: live.doctors, acceptingRequests: live.acceptingRequests, lastCapacityUpdatedAt: live.lastCapacityUpdatedAt, capacitySource: live.capacitySource } : hospital;
      });
    }
    await collection.updateOne(
      { _id: "carelink" },
      { $set: { state, updatedAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CareLink database write failed:", error);
    return NextResponse.json({ error: "Could not save CareLink data" }, { status: 503 });
  }
}
