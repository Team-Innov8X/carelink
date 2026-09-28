import { headers } from 'next/headers';
import { getAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongodb';

type PharmacyOrder = {
  id: string;
  medicineId: string;
  medicineName: string;
  pharmacyId: string;
  pharmacyName: string;
  requestedBy: string;
  quantity: number;
  status: 'Requested';
  timestamp: string;
  isUrgent: boolean;
  createdAt: Date;
};

async function requireSession() {
  await connectMongo();
  return getAuth().api.getSession({ headers: await headers() });
}

export async function GET() {
  const session = await requireSession();
  if (!session) return Response.json({ error: 'Sign in to access pharmacy orders.' }, { status: 401 });
  try {
    const client = await connectMongo();
    const orders = await client.db().collection<PharmacyOrder>('pharmacyOrders').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(100).toArray();
    return Response.json({ orders });
  } catch {
    return Response.json({ error: 'Could not load pharmacy orders.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return Response.json({ error: 'Sign in to place a pharmacy order.' }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const medicineId = typeof body.medicineId === 'string' ? body.medicineId.trim() : '';
    const medicineName = typeof body.medicineName === 'string' ? body.medicineName.trim() : '';
    const pharmacyId = typeof body.pharmacyId === 'string' ? body.pharmacyId.trim() : '';
    const pharmacyName = typeof body.pharmacyName === 'string' ? body.pharmacyName.trim() : '';
    const quantity = Number(body.quantity);
    if (!medicineId || !medicineName || !pharmacyId || !pharmacyName || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return Response.json({ error: 'Provide a medicine, pharmacy, and valid quantity.' }, { status: 400 });
    }
    const sessionUser = session.user as { name?: string; email?: string };
    const now = new Date();
    const order: PharmacyOrder = {
      id: `ORD-${now.getTime().toString(36).toUpperCase()}`,
      medicineId, medicineName, pharmacyId, pharmacyName,
      requestedBy: sessionUser.name || sessionUser.email || 'Patient',
      quantity, status: 'Requested', timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isUrgent: body.isUrgent !== false, createdAt: now,
    };
    const client = await connectMongo();
    await client.db().collection<PharmacyOrder>('pharmacyOrders').insertOne(order);
    return Response.json({ order }, { status: 201 });
  } catch {
    return Response.json({ error: 'Could not place pharmacy order.' }, { status: 503 });
  }
}
