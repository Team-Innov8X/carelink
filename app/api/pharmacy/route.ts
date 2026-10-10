import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { INITIAL_MEDICINES } from '@/data/mockMedicines';
import { INITIAL_PHARMACIES } from '@/data/mockPharmacies';
import { INITIAL_HOSPITALS } from '@/data/mockHospitals';
import { INITIAL_EMERGENCIES } from '@/data/mockEmergencies';
import { INITIAL_AMBULANCES } from '@/data/mockAmbulances';
import { INITIAL_DRIVERS } from '@/data/mockDrivers';
import type { Pharmacy } from '@/types';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';

type StateMedicine = { id: string; name: string; stock: Record<string, number>; [key: string]: unknown };
type StateOrder = { id: string; medicineId: string; medicineName: string; pharmacyId: string; pharmacyName: string; requestedBy: string; quantity: number; status: string; timestamp: string; isUrgent: boolean; [key: string]: unknown };
type State = { medicines: StateMedicine[]; medicineOrders: StateOrder[]; pharmacies: Pharmacy[]; [key: string]: unknown };

async function appState() {
  const db = (await clientPromise).db();
  const collection = db.collection<{ _id: string; state: State; updatedAt?: Date | string; pharmacyUpdatedAt?: Date | string }>('appState');
  let current = await collection.findOne({ _id: 'carelink' });
  if (!current) {
    const state = { hospitals: INITIAL_HOSPITALS, emergencies: INITIAL_EMERGENCIES, pharmacies: INITIAL_PHARMACIES, medicines: INITIAL_MEDICINES, ambulances: INITIAL_AMBULANCES, drivers: INITIAL_DRIVERS, medicineOrders: [] } as unknown as State;
    await collection.updateOne({ _id: 'carelink' }, { $setOnInsert: { state, updatedAt: new Date() } }, { upsert: true });
    current = await collection.findOne({ _id: 'carelink' });
  }
  return { collection, state: current!.state, updatedAt: current!.pharmacyUpdatedAt ?? current!.updatedAt };
}

function pharmacyForUser(user: { pharmacyId?: string }, pharmacies: Pharmacy[]) {
  return user.pharmacyId && pharmacies.some((pharmacy) => pharmacy.id === user.pharmacyId) ? user.pharmacyId : null;
}

function userFilter(id: string) {
  const ids: Record<string, unknown>[] = [{ _id: id }, { id }];
  if (ObjectId.isValid(id)) ids.unshift({ _id: new ObjectId(id) });
  return { $or: ids };
}

async function ensurePharmacyLink(userId: string, state: State, collection: Awaited<ReturnType<typeof appState>>['collection']) {
  const db = (await clientPromise).db();
  const users = db.collection('user');
  const account = await users.findOne(userFilter(userId));
  if (!account) return null;
  const profile = account as typeof account & { pharmacyId?: string; pharmacyName?: string; pharmacyAddress?: string; phone?: string; pharmacyCity?: string; pharmacyState?: string; pharmacyPincode?: string; email?: string };
  const pharmacies = [...(state.pharmacies ?? INITIAL_PHARMACIES)];
  let record = await db.collection('pharmacies').findOne({ ownerUserId: userId });
  if (!record && profile.pharmacyName?.trim()) {
    const name = profile.pharmacyName.trim();
    const street = profile.pharmacyAddress?.trim() || 'Address not provided';
    const now = new Date();
    await db.collection('pharmacies').updateOne({ ownerUserId: userId }, { $setOnInsert: {
      name,
      address: { street, city: profile.pharmacyCity || '', state: profile.pharmacyState || '', zipCode: profile.pharmacyPincode || '', country: 'India' },
      contact: { phone: profile.phone || '', email: profile.email || '' }, status: 'active', isDemo: false, ownerUserId: userId, createdAt: now, updatedAt: now,
    } }, { upsert: true });
    record = await db.collection('pharmacies').findOne({ ownerUserId: userId });
  }
  if (!record?._id) return null;
  const pharmacyId = String(record._id);
  const address = record.address as { street?: string; city?: string; state?: string; zipCode?: string } | undefined;
  const contact = record.contact as { phone?: string } | undefined;
  const inventoryPharmacy = {
    id: pharmacyId,
    name: String(record.name || profile.pharmacyName || 'Pharmacy'),
    distanceKm: 0,
    address: [address?.street, address?.city, address?.state, address?.zipCode].filter(Boolean).join(', '),
    phone: contact?.phone || profile.phone || '',
    isOpen: true,
    ...(record.location && typeof record.location === 'object' && 'coordinates' in record.location
      ? { location: { lat: Number((record.location as { coordinates: number[] }).coordinates[1]), lng: Number((record.location as { coordinates: number[] }).coordinates[0]) } }
      : {}),
    rating: 5,
  } as Pharmacy;
  const now = new Date();
  const nextMedicines = (state.medicines ?? INITIAL_MEDICINES).map((medicine) => ({ ...medicine, stock: { ...medicine.stock, [pharmacyId]: Number(medicine.stock?.[pharmacyId] ?? 0) } }));
  state.pharmacies = [inventoryPharmacy, ...pharmacies.filter((item) => item.id !== pharmacyId)];
  state.medicines = nextMedicines;
  await collection.updateOne({ _id: 'carelink' }, { $set: {
    'state.pharmacies': state.pharmacies,
    'state.medicines': nextMedicines,
    pharmacyUpdatedAt: now,
  } });
  await users.updateOne(userFilter(userId), { $set: { pharmacyId, onboardingCompleted: true, updatedAt: now } });
  return pharmacyId;
}

export async function GET() {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  try {
    const { state, updatedAt, collection } = await appState();
    const user = auth.user as typeof auth.user & { role?: string; pharmacyId?: string };
    let pharmacyId = pharmacyForUser(user, state.pharmacies ?? INITIAL_PHARMACIES);
    if (user.role === 'pharmacy' && !pharmacyId) pharmacyId = await ensurePharmacyLink(auth.user.id, state, collection);
    if (user.role === 'pharmacy' && !pharmacyId) return Response.json({ error: 'Your pharmacy account is not linked to a pharmacy.' }, { status: 403 });
    const medicineOrders = (state.medicineOrders ?? []).filter((order) =>
      user.role === 'pharmacy' ? order.pharmacyId === pharmacyId : user.role === 'patient' ? order.patientId === auth.user.id : true,
    );
    return Response.json({ medicines: state.medicines, medicineOrders, pharmacies: state.pharmacies, pharmacyId, updatedAt: typeof updatedAt === 'string' ? updatedAt : updatedAt?.toISOString() ?? new Date().toISOString() });
  } catch { return Response.json({ error: 'Could not load pharmacy data.' }, { status: 503 }); }
}

export async function POST(request: Request) {
  const auth = await requireRole(['pharmacy', 'patient', 'dispatcher']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let body: { action?: string; medicineId?: string; pharmacyId?: string; quantity?: number; name?: string; form?: string; category?: string; indication?: string; price?: string; minimum?: number; isEmergencyEssential?: boolean; status?: string; orderId?: string; reason?: string; isUrgent?: boolean; patientId?: string; caseId?: string; driverId?: string; ambulanceId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const pharmacyRole = (auth.user as typeof auth.user & { role?: string }).role === 'pharmacy';
  if (body.action === 'order' && !pharmacyRole && !['patient', 'dispatcher'].includes((auth.user as typeof auth.user & { role?: string }).role ?? '')) return Response.json({ error: 'You cannot request pharmacy orders.' }, { status: 403 });
  if (body.action !== 'order' && !pharmacyRole) return Response.json({ error: 'Only pharmacy staff can manage inventory and orders.' }, { status: 403 });
  const requestedPharmacy = body.pharmacyId;
  const now = new Date();
  const db = (await clientPromise).db();
  let collection: Awaited<ReturnType<typeof appState>>['collection'];
  let pharmacyId: string | null = null;
  try {
    ({ collection } = await appState());
    const current = await collection.findOne({ _id: 'carelink' });
    const pharmacies = current?.state.pharmacies ?? INITIAL_PHARMACIES;
    pharmacyId = pharmacyRole
      ? pharmacyForUser(auth.user as typeof auth.user & { pharmacyId?: string }, pharmacies) ?? await ensurePharmacyLink(auth.user.id, current?.state ?? ({ medicines: INITIAL_MEDICINES, medicineOrders: [], pharmacies } as unknown as State), collection)
      : requestedPharmacy && pharmacies.some((pharmacy) => pharmacy.id === requestedPharmacy) ? requestedPharmacy : null;
  } catch (error) {
    console.error('Could not resolve pharmacy inventory:', error);
    return Response.json({ error: 'Could not load pharmacy inventory.' }, { status: 503 });
  }
  if (!pharmacyId) return Response.json({ error: pharmacyRole ? 'Your pharmacy account is not linked to a pharmacy.' : 'Choose a valid pharmacy for this order.' }, { status: 400 });
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = await collection.findOne({ _id: 'carelink' });
      if (!current) break;
      const state = current.state;
      const medicines = [...(state.medicines ?? [])];
      const orders = [...(state.medicineOrders ?? [])];
      if (body.action === 'stock') {
        if (!body.medicineId || !Number.isSafeInteger(body.quantity) || (body.quantity ?? -1) < 0) return Response.json({ error: 'Enter a whole stock quantity of zero or more.' }, { status: 400 });
        const med = medicines.find((item) => item.id === body.medicineId);
        if (!med) return Response.json({ error: 'Medicine not found.' }, { status: 404 });
        const oldQuantity = Number(med.stock?.[pharmacyId] ?? 0);
        med.stock = { ...med.stock, [pharmacyId]: body.quantity! };
        med.updatedAt = now.toISOString();
        const versionFilter = current.pharmacyUpdatedAt === undefined ? { pharmacyUpdatedAt: { $exists: false } } : { pharmacyUpdatedAt: current.pharmacyUpdatedAt };
        const saved = await collection.updateOne({ _id: 'carelink', ...versionFilter }, { $set: { 'state.medicines': medicines, pharmacyUpdatedAt: now } });
        if (!saved.modifiedCount) continue;
        try { await db.collection('pharmacyInventoryLog').insertOne({ pharmacyId, pharmacyName: state.pharmacies.find((p) => p.id === pharmacyId)?.name, medicineId: med.id, medicineName: med.name, actorId: auth.user.id, actorName: auth.user.name, oldQuantity, newQuantity: body.quantity, createdAt: now }); }
        catch (error) { console.error('Could not write pharmacy inventory audit row:', error); }
        return Response.json({ success: true, medicines, updatedAt: now.toISOString() });
      }
      if (body.action === 'add') {
        const name = body.name?.trim();
        if (!name || !body.form?.trim() || !body.category?.trim() || !body.indication?.trim() || !body.price?.trim()) return Response.json({ error: 'Enter the name, form, category, use, and price for this medicine.' }, { status: 400 });
        if (medicines.some((item) => item.name.toLowerCase() === name.toLowerCase())) return Response.json({ error: 'A medicine with this name already exists.' }, { status: 409 });
        if (!Number.isSafeInteger(body.quantity) || (body.quantity ?? -1) < 0 || !Number.isSafeInteger(body.minimum) || (body.minimum ?? -1) < 0) return Response.json({ error: 'Starting stock and low stock threshold must be whole numbers of zero or more.' }, { status: 400 });
        const med: StateMedicine = { id: `med-${crypto.randomUUID()}`, name, form: body.form.trim(), category: body.category.trim(), indication: body.indication.trim(), isEmergencyEssential: Boolean(body.isEmergencyEssential), stock: { [pharmacyId]: body.quantity! }, price: body.price.trim(), minimumStock: body.minimum!, updatedAt: now.toISOString() };
        const versionFilter = current.pharmacyUpdatedAt === undefined ? { pharmacyUpdatedAt: { $exists: false } } : { pharmacyUpdatedAt: current.pharmacyUpdatedAt };
        const saved = await collection.updateOne({ _id: 'carelink', ...versionFilter }, { $set: { 'state.medicines': [med, ...medicines], pharmacyUpdatedAt: now } });
        if (!saved.modifiedCount) continue;
        try { await db.collection('pharmacyInventoryLog').insertOne({ pharmacyId, pharmacyName: state.pharmacies.find((p) => p.id === pharmacyId)?.name, medicineId: med.id, medicineName: med.name, actorId: auth.user.id, actorName: auth.user.name, oldQuantity: 0, newQuantity: body.quantity, createdAt: now }); }
        catch (error) { console.error('Could not write pharmacy inventory audit row:', error); }
        return Response.json({ success: true, medicines: [med, ...medicines], updatedAt: now.toISOString() });
      }
      if (body.action === 'order') {
        if (!body.medicineId || !Number.isSafeInteger(body.quantity) || (body.quantity ?? 0) < 1) return Response.json({ error: 'Enter a valid order quantity.' }, { status: 400 });
        const med = medicines.find((item) => item.id === body.medicineId);
        if (!med) return Response.json({ error: 'Medicine not found.' }, { status: 404 });
        const available = Number(med.stock?.[pharmacyId] ?? 0);
        if (available < body.quantity!) return Response.json({ error: 'Unavailable: there is not enough unreserved stock.' }, { status: 409 });
        const pharmacy = state.pharmacies.find((item) => item.id === pharmacyId) ?? INITIAL_PHARMACIES[0];
        const order: StateOrder = { id: `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, medicineId: med.id, medicineName: med.name, pharmacyId, pharmacyName: pharmacy.name, requestedBy: auth.user.name, quantity: body.quantity!, status: 'New', timestamp: now.toISOString(), isUrgent: Boolean(body.isUrgent), patientId: pharmacyRole ? body.patientId : auth.user.id, caseId: body.caseId, driverId: body.driverId, ambulanceId: body.ambulanceId, reserved: false };
        med.stock = { ...med.stock, [pharmacyId]: available - body.quantity! };
        med.updatedAt = now.toISOString();
        const saved = await collection.updateOne({ _id: 'carelink', 'state.medicines': current.state.medicines, 'state.medicineOrders': current.state.medicineOrders }, { $set: { 'state.medicines': medicines, 'state.medicineOrders': [order, ...orders], pharmacyUpdatedAt: now } });
        if (!saved.modifiedCount) continue;
        return Response.json({ success: true, order, medicines, medicineOrders: [order, ...orders] });
      }
      if (body.action === 'order-status') {
        if (!body.orderId || !['Confirmed', 'Packed', 'Picked up', 'Delivered', 'Rejected', 'Cancelled'].includes(body.status ?? '')) return Response.json({ error: 'Invalid order status.' }, { status: 400 });
        const order = orders.find((item) => item.id === body.orderId && item.pharmacyId === pharmacyId);
        if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });
        const previousStatus = order.status;
        if (['Delivered', 'Rejected', 'Cancelled'].includes(previousStatus)) return Response.json({ error: 'This order is already closed.' }, { status: 409 });
        order.status = body.status!;
        if (body.reason) order.rejectionReason = body.reason;
        order.updatedAt = now.toISOString();
        if (body.status === 'Rejected' || body.status === 'Cancelled') {
          const med = medicines.find((item) => item.id === order.medicineId);
          if (med) med.stock = { ...med.stock, [pharmacyId]: Number(med.stock?.[pharmacyId] ?? 0) + order.quantity };
        }
        const saved = await collection.updateOne({ _id: 'carelink', 'state.medicineOrders': current.state.medicineOrders, 'state.medicines': current.state.medicines }, { $set: { 'state.medicineOrders': orders, 'state.medicines': medicines, pharmacyUpdatedAt: now } });
        if (!saved.modifiedCount) continue;
        return Response.json({ success: true, medicines, medicineOrders: orders });
      }
      return Response.json({ error: 'Unknown pharmacy action.' }, { status: 400 });
    }
    return Response.json({ error: 'Inventory changed at the same time. Refresh and try again.' }, { status: 409 });
  } catch (error) {
    console.error('Pharmacy update failed:', error);
    return Response.json({ error: 'Could not save pharmacy changes.' }, { status: 503 });
  }
}
