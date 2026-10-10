import { z } from 'zod';
import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';
const schema = z.object({ name: z.string().trim().min(2).max(180), address: z.string().trim().min(8).max(500), city: z.string().trim().min(2).max(120), state: z.string().trim().min(2).max(120), pincode: z.string().trim().min(3).max(12), phone: z.string().trim().min(7).max(30), details: z.string().trim().max(2000).optional(), totalBeds: z.number().int().nonnegative().max(100000).optional(), openingHours: z.string().trim().max(250).optional() });

export async function GET() {
  const auth = await requireRole(['hospital', 'hospital_staff', 'pharmacy']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const account = await (await clientPromise).db().collection('user').findOne({ _id: auth.user.id as never }, { projection: { onboardingCompleted: 1 } });
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
    const geocodeUrl = new URL('https://nominatim.openstreetmap.org/search');
    geocodeUrl.searchParams.set('format', 'jsonv2'); geocodeUrl.searchParams.set('limit', '1'); geocodeUrl.searchParams.set('q', address);
    const geoResponse = await fetch(geocodeUrl, { headers: { 'User-Agent': 'CareLinkEmergencyAllocator/1.0 (facility onboarding)' }, signal: AbortSignal.timeout(10000) });
    if (!geoResponse.ok) return Response.json({ error: 'Could not locate this address. Check it and try again.' }, { status: 502 });
    const [geo] = await geoResponse.json() as { lat: string; lon: string }[];
    if (!geo) return Response.json({ error: 'Address not found. Add a more specific address.' }, { status: 422 });
    const now = new Date(); const db = (await clientPromise).db();
    const accountId = auth.user.id;
    const coords: [number, number] = [Number(geo.lon), Number(geo.lat)];
    const org = { name: input.data.name, address: { street: input.data.address, city: input.data.city, state: input.data.state, zipCode: input.data.pincode, country: 'India' }, location: { type: 'Point', coordinates: coords }, contact: { phone: input.data.phone, email: auth.user.email, emergencyHotline: input.data.phone }, status: 'active', isDemo: false, ownerUserId: accountId, services: input.data.details || '', openingHours: input.data.openingHours || '', updatedAt: now, createdAt: now };
    if (user.role === 'pharmacy') {
      await db.collection('pharmacies').updateOne({ ownerUserId: accountId }, { $set: org }, { upsert: true });
      await db.collection('user').updateOne({ _id: accountId as never }, { $set: { pharmacyName: org.name, pharmacyAddress: address, phone: org.contact.phone, onboardingCompleted: true, updatedAt: now } });
    } else {
      const code = `HOSP-${new ObjectId().toHexString().slice(-8).toUpperCase()}`;
      await db.collection('hospitals').updateOne({ ownerUserId: accountId }, { $set: { ...org, code, capacitySummary: { totalBeds: input.data.totalBeds || 0, availableBeds: input.data.totalBeds || 0, totalVentilators: 0, availableVentilators: 0 } } }, { upsert: true });
      await db.collection('user').updateOne({ _id: accountId as never }, { $set: { hospitalName: org.name, hospitalAddress: address, phone: org.contact.phone, onboardingCompleted: true, updatedAt: now } });
    }
    return Response.json({ success: true, location: { lat: coords[1], lng: coords[0] } });
  } catch { return Response.json({ error: 'Could not save organization details. Try again.' }, { status: 500 }); }
}
