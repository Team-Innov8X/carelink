import { z } from 'zod';
import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { INITIAL_HOSPITALS } from '@/data/mockHospitals';
import { INITIAL_EMERGENCIES } from '@/data/mockEmergencies';
import { INITIAL_PHARMACIES } from '@/data/mockPharmacies';
import { INITIAL_MEDICINES } from '@/data/mockMedicines';
import { INITIAL_AMBULANCES } from '@/data/mockAmbulances';
import { INITIAL_DRIVERS } from '@/data/mockDrivers';

export const runtime = 'nodejs';
const schema = z.object({ name: z.string().trim().min(2).max(180), address: z.string().trim().min(8).max(500), city: z.string().trim().min(2).max(120), state: z.string().trim().min(2).max(120), pincode: z.string().trim().min(3).max(12), phone: z.string().trim().min(7).max(30), details: z.string().trim().max(2000).optional(), totalBeds: z.number().int().nonnegative().max(100000).optional(), openingHours: z.string().trim().max(250).optional() });

function accountFilter(id: string) {
  const ids: Record<string, unknown>[] = [{ _id: id }, { id }];
  if (ObjectId.isValid(id)) ids.unshift({ _id: new ObjectId(id) });
  return { $or: ids };
}

export async function GET() {
  const auth = await requireRole(['hospital', 'hospital_staff', 'pharmacy']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const account = await (await clientPromise).db().collection('user').findOne(accountFilter(auth.user.id), { projection: { onboardingCompleted: 1 } });
  return Response.json({ onboardingCompleted: account?.onboardingCompleted === true });
}

export async function POST(request: Request) {
  const auth = await requireRole(['hospital', 'hospital_staff', 'pharmacy']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }
  const input = schema.safeParse(raw);
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message || 'Check the organization details.' }, { status: 400 });
  const user = auth.user as typeof auth.user & { role?: string; onboardingCompleted?: boolean };
  if (user.onboardingCompleted) return Response.json({ error: 'Onboarding is already complete.' }, { status: 409 });
  const address = `${input.data.address}, ${input.data.city}, ${input.data.state} ${input.data.pincode}, India`;
  try {
    const geocodeStartedAt = performance.now();
    let geoPoint: { lat: number; lng: number } | null = null;
    if (process.env.GOOGLE_MAPS_API_KEY) {
      const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      geocodeUrl.searchParams.set('address', address); geocodeUrl.searchParams.set('key', process.env.GOOGLE_MAPS_API_KEY);
      const response = await fetch(geocodeUrl, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return Response.json({ error: 'Could not locate this address. Check it and try again.' }, { status: 502 });
      const data = await response.json() as { status?: string; results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }> };
      const point = data.results?.[0]?.geometry?.location;
      if (data.status === 'OK' && typeof point?.lat === 'number' && typeof point.lng === 'number') geoPoint = { lat: point.lat, lng: point.lng };
    } else {
      const geocodeUrl = new URL('https://nominatim.openstreetmap.org/search');
      geocodeUrl.searchParams.set('format', 'jsonv2'); geocodeUrl.searchParams.set('limit', '1'); geocodeUrl.searchParams.set('q', address);
      const response = await fetch(geocodeUrl, { headers: { 'User-Agent': 'CareLinkEmergencyAllocator/1.0 (facility onboarding)' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return Response.json({ error: 'Could not locate this address. Check it and try again.' }, { status: 502 });
      const [geo] = await response.json() as { lat: string; lon: string }[];
      if (geo) geoPoint = { lat: Number(geo.lat), lng: Number(geo.lon) };
    }
    if (process.env.CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'onboarding_geocode', durationMs: Math.round((performance.now() - geocodeStartedAt) * 100) / 100 }));
    if (!geoPoint) return Response.json({ error: 'Address not found. Add a more specific address.' }, { status: 422 });
    const now = new Date(); const db = (await clientPromise).db();
    const accountId = auth.user.id;
    const coords: [number, number] = [geoPoint.lng, geoPoint.lat];
    const org = { name: input.data.name, address: { street: input.data.address, city: input.data.city, state: input.data.state, zipCode: input.data.pincode, country: 'India' }, location: { type: 'Point', coordinates: coords }, contact: { phone: input.data.phone, email: auth.user.email, emergencyHotline: input.data.phone }, status: 'active', isDemo: false, ownerUserId: accountId, services: input.data.details || '', openingHours: input.data.openingHours || '', updatedAt: now, createdAt: now };
    if (user.role === 'pharmacy') {
      await db.collection('pharmacies').updateOne({ ownerUserId: accountId }, { $set: org }, { upsert: true });
      const pharmacyRecord = await db.collection('pharmacies').findOne({ ownerUserId: accountId }, { projection: { _id: 1 } });
      if (!pharmacyRecord?._id) throw new Error('Pharmacy record could not be linked to your account.');
      const pharmacyId = String(pharmacyRecord._id);
      const inventoryPharmacy = { id: pharmacyId, name: org.name, distanceKm: 0, address, phone: org.contact.phone, isOpen: true, location: { lat: geoPoint.lat, lng: geoPoint.lng }, rating: 5 };
      const appStateCollection = db.collection<{ _id: string; state?: Record<string, unknown> }>('appState');
      await appStateCollection.updateOne({ _id: 'carelink' }, { $setOnInsert: { state: { hospitals: INITIAL_HOSPITALS, emergencies: INITIAL_EMERGENCIES, pharmacies: INITIAL_PHARMACIES, medicines: INITIAL_MEDICINES, ambulances: INITIAL_AMBULANCES, drivers: INITIAL_DRIVERS, medicineOrders: [] }, updatedAt: now } }, { upsert: true });
      const appState = await appStateCollection.findOne({ _id: 'carelink' });
      const shared = appState?.state ?? {};
      const pharmacies = Array.isArray(shared.pharmacies) ? shared.pharmacies as Array<{ id: string }> : INITIAL_PHARMACIES;
      const medicines = Array.isArray(shared.medicines) ? shared.medicines as Array<{ stock?: Record<string, number>; [key: string]: unknown }> : INITIAL_MEDICINES;
      await appStateCollection.updateOne({ _id: 'carelink' }, { $set: {
        'state.pharmacies': [inventoryPharmacy, ...pharmacies.filter((item) => item.id !== pharmacyId)],
        'state.medicines': medicines.map((medicine) => ({ ...medicine, stock: { ...medicine.stock, [pharmacyId]: Number(medicine.stock?.[pharmacyId] ?? 0) } })),
        pharmacyUpdatedAt: now,
      } });
      await db.collection('user').updateOne(accountFilter(accountId), { $set: { pharmacyName: org.name, pharmacyAddress: address, pharmacyId, phone: org.contact.phone, onboardingCompleted: true, updatedAt: now } });
    } else {
      const code = `HOSP-${new ObjectId().toHexString().slice(-8).toUpperCase()}`;
      await db.collection('hospitals').updateOne({ ownerUserId: accountId }, { $set: { ...org, code, capacitySummary: { totalBeds: input.data.totalBeds || 0, availableBeds: input.data.totalBeds || 0, totalVentilators: 0, availableVentilators: 0 } } }, { upsert: true });
      await db.collection('user').updateOne(accountFilter(accountId), { $set: { hospitalName: org.name, hospitalAddress: address, phone: org.contact.phone, onboardingCompleted: true, updatedAt: now } });
    }
    return Response.json({ success: true, location: geoPoint });
  } catch { return Response.json({ error: 'Could not save organization details. Try again.' }, { status: 500 }); }
}
