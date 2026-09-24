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
    if (stored) return NextResponse.json({ state: stored.state, connected: true });
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
