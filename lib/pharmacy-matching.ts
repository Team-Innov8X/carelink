import type { Medicine } from "@/types";

export type PharmacyMatchRecord = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  isDemo?: boolean;
  location?: { lat?: number; lng?: number };
};

export type PharmacyMatchInput = {
  medicine: string;
  quantity: number;
  origin: { latitude: number; longitude: number };
  radiusKm: number;
  limit: number;
};

export type PharmacyMatch = {
  pharmacyId: string;
  isDemo: boolean;
  pharmacyName: string;
  address: string;
  phone?: string;
  medicineId: string;
  medicineName: string;
  formulation: string;
  requestedQuantity: number;
  availableQuantity: number | null;
  availability: "verified_available" | "verified_unavailable" | "unverified";
  eligibleForRequest: boolean;
  stockUpdatedAt: string | null;
  distanceKm: number | null;
  score: number;
  scoreBreakdown: { medicineIdentity: number; verifiedStock: number; distance: number };
  scoreContributions: { medicine: number; stock: number; distance: number };
  explanation: string;
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

function distanceKm(origin: PharmacyMatchInput["origin"], lat: number, lng: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat - origin.latitude);
  const dLng = radians(lng - origin.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(origin.latitude)) * Math.cos(radians(lat)) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rankPharmacies(args: {
  pharmacies: PharmacyMatchRecord[];
  medicines: Medicine[];
  stockUpdates: Array<{ pharmacyId?: string; medicineId?: string; newQuantity?: number; createdAt?: Date | string }>;
  input: PharmacyMatchInput;
  weights?: { medicine: number; stock: number; distance: number };
  now?: Date;
}): PharmacyMatch[] {
  const now = args.now ?? new Date();
  const query = normalize(args.input.medicine);
  const exactMedicine = args.medicines.find((item) => normalize(item.name) === query);
  const prefixMatches = args.medicines.filter((item) => normalize(item.name).startsWith(query));
  const medicine = exactMedicine ?? (prefixMatches.length === 1 ? prefixMatches[0] : undefined);
  if (!medicine) return [];
  const weights = args.weights ?? { medicine: 45, stock: 40, distance: 15 };
  const totalWeight = weights.medicine + weights.stock + weights.distance;
  if (Object.values(weights).some((weight) => !Number.isFinite(weight) || weight < 0) || totalWeight <= 0) throw new RangeError("Pharmacy matching weights must be non-negative and have a positive sum.");

  const matches = args.pharmacies.flatMap((pharmacy) => {
    const pharmacyId = String(pharmacy.id ?? "");
    if (!pharmacyId) return [];
    const update = args.stockUpdates
      .filter((item) => item.pharmacyId === pharmacyId && item.medicineId === medicine.id)
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];
    const location = pharmacy.location;
    const hasLocation = Number.isFinite(location?.lat) && Number.isFinite(location?.lng);
    const distance = hasLocation ? distanceKm(args.input.origin, location!.lat!, location!.lng!) : null;
    if (distance != null && distance > args.input.radiusKm) return [];
    const hasStock = Object.prototype.hasOwnProperty.call(medicine.stock ?? {}, pharmacyId);
    const availableQuantity = hasStock ? Math.max(0, Number(medicine.stock[pharmacyId]) || 0) : null;
    // Availability is verified only by a pharmacy-specific stock audit row.
    const updatedAt = update?.createdAt ? new Date(update.createdAt) : null;
    const fresh = Boolean(updatedAt && Number.isFinite(updatedAt.getTime()) && now.getTime() - updatedAt.getTime() <= 6 * 60 * 60_000);
    const availability: PharmacyMatch["availability"] = !update || !fresh || update.newQuantity !== availableQuantity
      ? "unverified"
      : (availableQuantity ?? 0) >= args.input.quantity ? "verified_available" : "verified_unavailable";
    const distanceFit = distance == null ? 0 : Math.max(0, 1 - distance / Math.max(args.input.radiusKm, 1));
    const stockFit = availability === "verified_available" ? 1 : 0;
    const scoreContributions = {
      medicine: Math.round(weights.medicine / totalWeight * 100 * 100) / 100,
      stock: Math.round(stockFit * weights.stock / totalWeight * 100 * 100) / 100,
      distance: Math.round(distanceFit * weights.distance / totalWeight * 100 * 100) / 100,
    };
    const scoreBreakdown = { medicineIdentity: 1, verifiedStock: stockFit, distance: distanceFit };
    const score = Math.min(100, Math.round((scoreContributions.medicine + scoreContributions.stock + scoreContributions.distance) * 100) / 100);
    const explanation = availability === "verified_available"
      ? `${medicine.name} has ${availableQuantity} unit(s) in a pharmacy stock update from ${updatedAt!.toLocaleString()}.${distance == null ? " Distance is unavailable." : ` About ${distance.toFixed(1)} km away.`}`
      : availability === "verified_unavailable"
        ? `A recent pharmacy stock update verifies fewer than ${args.input.quantity} requested unit(s).`
        : `A stock quantity is ${hasStock ? "recorded" : "not recorded"}, but no pharmacy-specific stock update from the last six hours verifies it.`;
    return [{
      pharmacyId, isDemo: Boolean(pharmacy.isDemo || medicine.isDemo), pharmacyName: pharmacy.name, address: pharmacy.address ?? "Address unavailable", phone: pharmacy.phone || undefined,
      medicineId: medicine.id, medicineName: medicine.name, formulation: medicine.form, requestedQuantity: args.input.quantity,
      availableQuantity, availability, eligibleForRequest: availability === "verified_available", stockUpdatedAt: updatedAt?.toISOString() ?? null,
      distanceKm: distance == null ? null : Number(distance.toFixed(1)), score, scoreBreakdown, scoreContributions, explanation,
    }];
  });

  return matches.sort((a, b) => Number(b.availability === "verified_available") - Number(a.availability === "verified_available")
    || b.score - a.score || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.pharmacyName.localeCompare(b.pharmacyName)).slice(0, args.input.limit);
}
