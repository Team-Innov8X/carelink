import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { INITIAL_MEDICINES } from '@/data/mockMedicines';
import { INITIAL_PHARMACIES } from '@/data/mockPharmacies';
import { INITIAL_HOSPITALS } from '@/data/mockHospitals';
import { INITIAL_EMERGENCIES } from '@/data/mockEmergencies';
import { INITIAL_AMBULANCES } from '@/data/mockAmbulances';
import { INITIAL_DRIVERS } from '@/data/mockDrivers';

export const runtime = 'nodejs';

type StateMedicine = { id: string; name: string; stock: Record<string, number>; [key: string]: unknown };
type StateOrder = { id: string; medicineId: string; medicineName: string; pharmacyId: string; pharmacyName: string; requestedBy: string; quantity: number; status: string; timestamp: string; isUrgent: boolean; [key: string]: unknown };
type State = { medicines: StateMedicine[]; medicineOrders: StateOrder[]; pharmacies: typeof INITIAL_PHARMACIES; [key: string]: unknown };

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

function pharmacyForUser(user: { pharmacyId?: string }) {
  return user.pharmacyId && INITIAL_PHARMACIES.some((p) => p.id === user.pharmacyId) ? user.pharmacyId : null;
}

export async function GET() {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  try {
    const { state, updatedAt } = await appState();
    const user = auth.user as typeof auth.user & { role?: string; pharmacyId?: string };
    const pharmacyId = pharmacyForUser(user);
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
  let body: { action?: string; medicineId?: string; pharmacyId?: string; quantity?: number; name?: string; form?: string; category?: string; indication?: string; minimum?: number; status?: string; orderId?: string; reason?: string; isUrgent?: boolean; patientId?: string; caseId?: string; driverId?: string; ambulanceId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const pharmacyRole = (auth.user as typeof auth.user & { role?: string }).role === 'pharmacy';
  if (body.action === 'order' && !pharmacyRole && !['patient', 'dispatcher'].includes((auth.user as typeof auth.user & { role?: string }).role ?? '')) return Response.json({ error: 'You cannot request pharmacy orders.' }, { status: 403 });
  if (body.action !== 'order' && !pharmacyRole) return Response.json({ error: 'Only pharmacy staff can manage inventory and orders.' }, { status: 403 });
  const requestedPharmacy = body.pharmacyId;
  const pharmacyId = pharmacyRole ? pharmacyForUser(auth.user as typeof auth.user & { pharmacyId?: string }) : requestedPharmacy && INITIAL_PHARMACIES.some((p) => p.id === requestedPharmacy) ? requestedPharmacy : null;
  if (!pharmacyId) return Response.json({ error: pharmacyRole ? 'Your pharmacy account is not linked to a pharmacy.' : 'Choose a valid pharmacy for this order.' }, { status: 400 });
  const now = new Date();
  const db = (await clientPromise).db();
  try {
    const { collection } = await appState();
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
        const saved = await collection.updateOne({ _id: 'carelink', 'state.medicines': current.state.medicines }, { $set: { 'state.medicines': medicines, pharmacyUpdatedAt: now } });
        if (!saved.modifiedCount) continue;
        try { await db.collection('pharmacyInventoryLog').insertOne({ pharmacyId, pharmacyName: state.pharmacies.find((p) => p.id === pharmacyId)?.name, medicineId: med.id, medicineName: med.name, actorId: auth.user.id, actorName: auth.user.name, oldQuantity, newQuantity: body.quantity, createdAt: now }); }
        catch (error) { console.error('Could not write pharmacy inventory audit row:', error); }
        return Response.json({ success: true, medicines, updatedAt: now.toISOString() });
      }
      if (body.action === 'add') {
        const name = body.name?.trim();
        if (!name || medicines.some((item) => item.name.toLowerCase() === name.toLowerCase())) return Response.json({ error: 'Enter a unique medicine name.' }, { status: 400 });
        const med: StateMedicine = { id: `med-${crypto.randomUUID()}`, name, form: body.form?.trim() || 'Not specified', category: body.category?.trim() || 'OTC', indication: body.indication?.trim() || 'Added by pharmacy', isEmergencyEssential: false, stock: { [pharmacyId]: 0 }, price: 'Ask pharmacy', minimumStock: Math.max(0, body.minimum ?? 5), updatedAt: now.toISOString() };
        const saved = await collection.updateOne({ _id: 'carelink', 'state.medicines': current.state.medicines }, { $set: { 'state.medicines': [med, ...medicines], pharmacyUpdatedAt: now } });
        if (!saved.modifiedCount) continue;
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
        try { await db.collection('pharmacyInventoryLog').insertOne({ pharmacyId, pharmacyName: pharmacy.name, medicineId: med.id, medicineName: med.name, actorId: auth.user.id, actorName: auth.user.name, oldQuantity: available, newQuantity: available - body.quantity!, reason: 'order', createdAt: now }); }
        catch (error) { console.error('Could not write pharmacy inventory audit row:', error); }
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
        let restoredStock: { medicine: StateMedicine; oldQuantity: number; newQuantity: number } | null = null;
        if (body.status === 'Rejected' || body.status === 'Cancelled') {
          const med = medicines.find((item) => item.id === order.medicineId);
          if (med) {
            const oldQuantity = Number(med.stock?.[pharmacyId] ?? 0);
            const newQuantity = oldQuantity + order.quantity;
            med.stock = { ...med.stock, [pharmacyId]: newQuantity };
            med.updatedAt = now.toISOString();
            restoredStock = { medicine: med, oldQuantity, newQuantity };
          }
        }
        const saved = await collection.updateOne({ _id: 'carelink', 'state.medicineOrders': current.state.medicineOrders, 'state.medicines': current.state.medicines }, { $set: { 'state.medicineOrders': orders, 'state.medicines': medicines, pharmacyUpdatedAt: now } });
        if (!saved.modifiedCount) continue;
        if (restoredStock) {
          try { await db.collection('pharmacyInventoryLog').insertOne({ pharmacyId, pharmacyName: state.pharmacies.find((item) => item.id === pharmacyId)?.name, medicineId: restoredStock.medicine.id, medicineName: restoredStock.medicine.name, actorId: auth.user.id, actorName: auth.user.name, oldQuantity: restoredStock.oldQuantity, newQuantity: restoredStock.newQuantity, reason: body.status!.toLowerCase(), createdAt: now }); }
          catch (error) { console.error('Could not write pharmacy inventory audit row:', error); }
        }
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
