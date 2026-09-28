import { NextResponse } from "next/server";
import { headers } from "next/headers";
import connectMongo from "@/lib/mongodb";
import { getAuth } from "@/lib/auth";
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
  const client = await connectMongo();
  return client.db().collection<{ _id: string; state: Record<string, unknown>; updatedAt?: Date; revision?: number }>("appState");
};

const hasSession = async () => {
  await connectMongo();
  return Boolean(await getAuth().api.getSession({ headers: await headers() }));
};

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
      { $setOnInsert: { state: defaultState, updatedAt: new Date(), revision: 0 } },
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
    const incomingHospitals = state.hospitals as Record<string, unknown>[];
    const bedTypes = ["general", "icu", "trauma", "ventilators"] as const;
    for (let attempt = 0; attempt < 5; attempt++) {
      const stored = await collection.findOne({ _id: "carelink" });
      const savedHospitals = Array.isArray(stored?.state?.hospitals)
        ? stored.state.hospitals as Record<string, unknown>[]
        : [];
      const mergedHospitals = incomingHospitals.map((incoming) => {
        const current = savedHospitals.find((hospital) => hospital.id === incoming.id);
        if (!current) return incoming;
        const oldBeds = current.beds && typeof current.beds === "object" ? current.beds as Record<string, unknown> : {};
        const newBeds = incoming.beds && typeof incoming.beds === "object" ? incoming.beds as Record<string, unknown> : {};
        const beds = { ...newBeds };
        for (const bedType of bedTypes) {
          const oldBed = oldBeds[bedType] as { available?: unknown } | undefined;
          const newBed = newBeds[bedType] as { available?: unknown; total?: unknown } | undefined;
          if (typeof oldBed?.available === "number" && typeof newBed?.total === "number") {
            beds[bedType] = { ...newBed, available: Math.min(oldBed.available, newBed.total) };
          }
        }
        const incomingDoctors = incoming.specialtyDoctors && typeof incoming.specialtyDoctors === "object" ? incoming.specialtyDoctors as Record<string, number> : {};
        const savedDoctors = current.specialtyDoctors && typeof current.specialtyDoctors === "object" ? current.specialtyDoctors as Record<string, number> : {};
        return { ...incoming, beds, specialtyDoctors: { ...incomingDoctors, ...savedDoctors } };
      });
      const stateToSave = { ...state, hospitals: mergedHospitals };
      const filter = stored
        ? { _id: "carelink", ...(typeof stored.revision === "number" ? { revision: stored.revision } : { revision: { $exists: false } }) }
        : { _id: "carelink" };
      try {
        const result = await collection.updateOne(
          filter,
          { $set: { state: stateToSave, updatedAt: new Date() }, $inc: { revision: 1 } },
          { upsert: !stored },
        );
        if (result.modifiedCount === 1 || result.upsertedCount === 1) return NextResponse.json({ success: true });
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
      }
    }
    return NextResponse.json({ error: "Shared data changed while saving. Please retry." }, { status: 409 });
  } catch (error) {
    console.error("CareLink database write failed:", error);
    return NextResponse.json({ error: "Could not save CareLink data" }, { status: 503 });
  }
}
