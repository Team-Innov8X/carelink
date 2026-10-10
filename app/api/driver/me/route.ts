import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { sosCollections } from '@/lib/sos';

export const runtime = 'nodejs';

type DriverProfile = { vehicleNumber?: string; driverQualification?: string };

export async function GET() {
  const auth = await requireRole(['ambulance_driver', 'driver']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const profile = auth.user as typeof auth.user & DriverProfile;
  const { drivers } = await sosCollections();
  const driver = await drivers.findOne({ userId: auth.user.id });
  return Response.json({ driver: {
    name: auth.user.name,
    ambulanceId: profile.vehicleNumber || driver?.ambulanceId || driver?.vehicleNumber || null,
    vehicleType: driver?.vehicleType || null,
    qualification: profile.driverQualification || null,
  } });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(['ambulance_driver', 'driver']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let body: { vehicleNumber?: unknown; vehicleType?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }
  const vehicleNumber = typeof body.vehicleNumber === 'string' ? body.vehicleNumber.trim().toUpperCase() : '';
  const vehicleType = body.vehicleType;
  if (!/^[A-Z0-9 -]{3,20}$/.test(vehicleNumber)) return Response.json({ error: 'Enter a valid ambulance registration number (3–20 letters or numbers).' }, { status: 400 });
  if (vehicleType !== 'basic' && vehicleType !== 'advanced_life_support') return Response.json({ error: 'Choose basic or advanced life support.' }, { status: 400 });

  const { drivers } = await sosCollections();
  const current = await drivers.findOne({ userId: auth.user.id });
  if (current?.available || current?.activeRequestId) return Response.json({ error: 'Go offline and complete any active trip before changing the linked ambulance.' }, { status: 409 });
  const now = new Date();
  await drivers.updateOne({ userId: auth.user.id }, { $set: {
    userId: auth.user.id,
    name: auth.user.name,
    ambulanceId: vehicleNumber,
    vehicleNumber,
    vehicleType,
    available: false,
    updatedAt: now,
  } }, { upsert: true });
  await (await clientPromise).db().collection('user').updateOne(
    { _id: auth.user.id as never },
    { $set: { vehicleNumber, updatedAt: now } },
  );
  return Response.json({ driver: { name: auth.user.name, ambulanceId: vehicleNumber, vehicleType } });
}
