import { z } from "zod";
import { requireRole } from "@/lib/auth-utils";
import clientPromise from "@/lib/mongodb";
import { rankPharmacies, type PharmacyMatchRecord } from "@/lib/pharmacy-matching";
import type { Medicine } from "@/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  medicine: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(1000).default(1),
  origin: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }),
  radiusKm: z.number().finite().min(1).max(100).default(25),
  limit: z.number().int().min(1).max(100).default(50),
});

type PharmacyState = {
  pharmacies?: Array<Record<string, unknown>>;
  medicines?: Medicine[];
};
type PharmacyDocument = { _id?: { toString(): string }; name?: string; address?: string | { street?: string; city?: string; state?: string; zipCode?: string; country?: string }; location?: { type?: string; coordinates?: unknown; latitude?: unknown; longitude?: unknown }; contact?: { phone?: string }; phone?: string; isDemo?: boolean };

function mapRegisteredPharmacy(document: PharmacyDocument) {
  const coordinates = Array.isArray(document.location?.coordinates) ? document.location.coordinates : [];
  const lat = typeof document.location?.latitude === 'number' ? document.location.latitude : typeof coordinates[1] === 'number' ? coordinates[1] : undefined;
  const lng = typeof document.location?.longitude === 'number' ? document.location.longitude : typeof coordinates[0] === 'number' ? coordinates[0] : undefined;
  const address = typeof document.address === 'string' ? document.address : [document.address?.street, document.address?.city, document.address?.state, document.address?.zipCode, document.address?.country].filter(Boolean).join(', ');
  return { id: document._id?.toString() ?? '', name: document.name ?? 'Registered pharmacy', address, phone: document.contact?.phone ?? document.phone ?? '', location: { lat, lng }, distanceKm: 0, rating: 0, isOpen: false, isDemo: Boolean(document.isDemo) };
}

export async function POST(request: Request) {
  const auth = await requireRole(["patient", "dispatcher"]);
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") }, { status: 400 });

  try {
    const db = (await clientPromise).db();
    const [appState, settings, registeredPharmacies] = await Promise.all([
      db.collection<{ _id: string; state?: PharmacyState }>("appState").findOne({ _id: "carelink" }, { projection: { state: 1 } }),
      db.collection<{ _id: string; pharmacyWeights?: { medicine: number; stock: number; distance: number } }>("carelinkSettings").findOne({ _id: "carelink" }, { projection: { pharmacyWeights: 1 } }),
      db.collection<PharmacyDocument>("pharmacies").find(process.env.NODE_ENV === "production" ? { isDemo: { $ne: true } } : {}).toArray(),
    ]);
    if (!appState?.state) return Response.json({ error: "Pharmacy inventory is not available in the database yet." }, { status: 503 });
    const weights = settings?.pharmacyWeights ?? { medicine: 45, stock: 40, distance: 15 };
    const sharedPharmacies = process.env.NODE_ENV === "production" ? [] : (appState.state.pharmacies ?? []);
    const pharmacyRecords = [...new Map([
      ...sharedPharmacies.map((item) => [String(item.id ?? ""), item] as const),
      ...registeredPharmacies.map((document) => { const item = mapRegisteredPharmacy(document); return [item.id, item] as const; }),
    ].filter(([id]) => Boolean(id))).values()];
    const medicines = (appState.state.medicines ?? []).filter((item) => (process.env.NODE_ENV !== "production" || item.isDemo !== true) && !(process.env.NODE_ENV === "production" && /^med-\d+$/.test(item.id)));
    const normalizedQuery = parsed.data.medicine.trim().toLowerCase().replace(/\s+/g, " ");
    const exactMedicine = medicines.find((item) => item.name.trim().toLowerCase().replace(/\s+/g, " ") === normalizedQuery);
    const prefixMatches = medicines.filter((item) => item.name.trim().toLowerCase().replace(/\s+/g, " ").startsWith(normalizedQuery));
    const selectedMedicine = exactMedicine ?? (prefixMatches.length === 1 ? prefixMatches[0] : undefined);
    const stockUpdates = selectedMedicine ? await db.collection("pharmacyInventoryLog").find({
      medicineId: selectedMedicine.id,
      createdAt: { $gte: new Date(Date.now() - 6 * 60 * 60_000) },
    }, { projection: { pharmacyId: 1, medicineId: 1, newQuantity: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray() : [];
    const ranked = rankPharmacies({
      pharmacies: pharmacyRecords as PharmacyMatchRecord[],
      medicines,
      stockUpdates: stockUpdates as Array<{ pharmacyId?: string; medicineId?: string; newQuantity?: number; createdAt?: Date | string }>,
      input: parsed.data,
      weights,
    });
    return Response.json({
      ranked,
      queriedAt: new Date().toISOString(),
      availabilityPolicy: "Only pharmacy-specific stock audit updates from the last six hours are reported as verified.",
      scoring: weights,
    });
  } catch (error) {
    console.error("Pharmacy matching failed:", error);
    return Response.json({ error: "Could not search pharmacy inventory right now." }, { status: 503 });
  }
}
