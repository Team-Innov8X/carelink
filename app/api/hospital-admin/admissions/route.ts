import { requireRole, resolveHospitalId } from '@/lib/auth-utils';
import { workflowCollections } from '@/lib/sos';
import { ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongodb';
import { getHoldsCollection, getResourcesCollection, getUsersCollection } from '@/lib/models';
import { writeHospitalAudit } from '@/lib/hospital-audit';

export const runtime = 'nodejs';

async function returnReservedBed(admission: { hospitalId: string; bedCategory?: string; inventorySource?: string; holdId?: string }) {
  if (!admission.bedCategory && !admission.holdId) return true;
  if (admission.inventorySource === 'app-state' && admission.bedCategory) {
    const client = await clientPromise;
    const collection = client.db().collection<{ _id: string; state?: { hospitals?: Array<{ id: string; beds?: Record<string, { total: number; available: number }> }> } }>('appState');
    const state = await collection.findOne({ _id: 'carelink' });
    const hospital = state?.state?.hospitals?.find((item) => item.id === admission.hospitalId);
    const bed = hospital?.beds?.[admission.bedCategory];
    if (!hospital || !bed) return false;
    if (bed.available >= bed.total) return true;
    const result = await collection.updateOne(
      { _id: 'carelink', 'state.hospitals': { $elemMatch: { id: hospital.id, [`beds.${admission.bedCategory}.total`]: bed.total, [`beds.${admission.bedCategory}.available`]: bed.available } } },
      { $inc: { [`state.hospitals.$[hospital].beds.${admission.bedCategory}.available`]: 1 }, $set: { updatedAt: new Date() } },
      { arrayFilters: [{ 'hospital.id': hospital.id }] },
    );
    return result.modifiedCount === 1;
  }
  if (!admission.holdId) return true;
  const holdId = ObjectId.isValid(admission.holdId) ? new ObjectId(admission.holdId) : admission.holdId;
  const holds = await getHoldsCollection();
  const hold = await holds.findOne({ _id: holdId as never });
  if (!hold || hold.status === 'discharged') return Boolean(hold);
  if (hold.status !== 'fulfilled' && hold.status !== 'confirmed') return false;
  const resourceId = ObjectId.isValid(String(hold.resourceId)) ? new ObjectId(String(hold.resourceId)) : hold.resourceId;
  const resources = await getResourcesCollection();
  const resource = await resources.findOne({ _id: resourceId as never });
  if (!resource || resource.availableQuantity + hold.quantity > resource.totalQuantity) return false;
  const updated = await resources.updateOne(
    { _id: resourceId as never, availableQuantity: resource.availableQuantity, totalQuantity: resource.totalQuantity },
    { $inc: { availableQuantity: hold.quantity }, $set: { status: 'available', updatedAt: new Date() } },
  );
  if (!updated.modifiedCount) return false;
  await holds.updateOne({ _id: hold._id }, { $set: { status: 'discharged', updatedAt: new Date() } });
  return true;
}

function hospitalScope(user: { id: string } & Record<string, unknown>) {
  const hospitalId = typeof user.hospitalId === 'string' ? user.hospitalId : '';
  const hospitalName = typeof user.hospitalName === 'string' ? user.hospitalName : '';
  const scope: Record<string, string>[] = [];
  if (hospitalId) scope.push({ hospitalId });
  if (hospitalName) scope.push({ hospitalName });
  return scope.length ? { $or: scope } : null;
}

export async function GET() {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized || !authorization.user) {
    return Response.json({ error: authorization.reason }, { status: authorization.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  try {
  const scope = hospitalScope(authorization.user as typeof authorization.user & Record<string, unknown>);
  if (!scope) return Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 });
  const { hospitalAdmissions } = await workflowCollections();
  const admissions = await hospitalAdmissions.find({ ...scope, dischargedAt: { $exists: false } }).sort({ admittedAt: -1 }).limit(200).toArray();
  return Response.json({ admissions });
  } catch (error) {
    console.error('Could not load hospital admissions:', error);
    return Response.json({ error: 'Could not load admitted patients. Please refresh and try again.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized || !authorization.user) {
    return Response.json({ error: authorization.reason }, { status: authorization.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const scope = hospitalScope(authorization.user as typeof authorization.user & Record<string, unknown>);
  if (!scope) return Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 });
  let body: { admissionId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (typeof body.admissionId !== 'string' || !body.admissionId.trim()) return Response.json({ error: 'admissionId is required.' }, { status: 400 });
  const { hospitalAdmissions } = await workflowCollections();
  const admission = await hospitalAdmissions.findOne({ _id: body.admissionId.trim(), ...scope, dischargedAt: { $exists: false } });
  if (!admission) return Response.json({ error: 'Current admission not found for this hospital.' }, { status: 404 });
  const dischargedAt = new Date();
  const result = await hospitalAdmissions.updateOne(
    { _id: body.admissionId.trim(), ...scope, dischargedAt: { $exists: false } },
    { $set: { dischargedAt } },
  );
  if (!result.matchedCount) return Response.json({ error: 'Current admission not found for this hospital.' }, { status: 404 });
  const bedReturned = await returnReservedBed(admission);
  if (!bedReturned) {
    await hospitalAdmissions.updateOne({ _id: admission._id, dischargedAt }, { $unset: { dischargedAt: '' } });
    return Response.json({ error: 'The bed could not be returned to inventory. Refresh and try again.' }, { status: 409 });
  }
  await writeHospitalAudit({ hospitalId: admission.hospitalId, hospitalName: admission.hospitalName, actorId: authorization.user.id, actorName: authorization.user.name, action: 'Patient discharged · bed released', entityType: 'admission', entityId: body.admissionId.trim(), details: { patientName: admission.patientName, bedCategory: admission.bedCategory }, createdAt: dischargedAt });
  return Response.json({ success: true });
}

export async function POST(request: Request) {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized || !authorization.user) {
    return Response.json({ error: authorization.reason }, { status: authorization.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const scope = hospitalScope(authorization.user as typeof authorization.user & Record<string, unknown>);
  if (!scope) return Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 });
  let body: { hospitalRequestId?: unknown; holdId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (typeof body.holdId === 'string' && body.holdId.trim()) {
    const profile = authorization.user as typeof authorization.user & { hospitalId?: string; hospitalName?: string };
    const hospitalId = await resolveHospitalId(profile);
    if (!hospitalId) return Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 });
    const holdId = body.holdId.trim();
    const queryId = ObjectId.isValid(holdId) ? new ObjectId(holdId) : holdId;
    const holds = await getHoldsCollection();
    const hold = await holds.findOne({ $or: [{ _id: queryId as never }, { id: holdId }], hospitalId, status: { $in: ['confirmed', 'fulfilled'] } });
    if (!hold) return Response.json({ error: 'Confirmed bed request not found for this hospital.' }, { status: 404 });
    const resources = await getResourcesCollection();
    const resourceId = ObjectId.isValid(hold.resourceId) ? new ObjectId(hold.resourceId) : hold.resourceId;
    const resource = await resources.findOne({ _id: resourceId as never });
    const category = String(resource?.category ?? 'general').toLowerCase();
    const bedCategory = category === 'icu' ? 'icu' : category === 'trauma' || category === 'pediatric' ? 'trauma' : category === 'ventilator' || category === 'ventilators' ? 'ventilators' : 'general';
    const users = await getUsersCollection();
    const patient = hold.patientId ? await users.findOne({ $or: [{ id: hold.patientId }, { _id: hold.patientId as never }] }) : null;
    const admittedAt = hold.fulfilledAt ?? new Date();
    const { hospitalAdmissions } = await workflowCollections();
    await hospitalAdmissions.createIndex({ hospitalRequestId: 1 }, { unique: true });
    await hospitalAdmissions.updateOne({ hospitalRequestId: holdId }, { $setOnInsert: {
      _id: holdId,
      hospitalRequestId: holdId,
      hospitalId,
      hospitalName: profile.hospitalName || 'Hospital',
      patientId: hold.patientId || hold.requestedByUserId || '',
      patientName: hold.patientDetails?.name || patient?.name || 'Patient',
      patientPhone: patient?.phone,
      incidentType: hold.patientDetails?.conditionSummary || hold.notes || 'Hospital bed request',
      bedCategory,
      holdId,
      admittedAt,
    } }, { upsert: true });
    if (hold.status === 'confirmed') await holds.updateOne({ _id: hold._id, status: 'confirmed' }, { $set: { status: 'fulfilled', fulfilledAt: admittedAt, updatedAt: admittedAt } });
    const admission = await hospitalAdmissions.findOne({ hospitalRequestId: holdId });
    await writeHospitalAudit({ hospitalId, hospitalName: profile.hospitalName || 'Hospital', actorId: authorization.user.id, actorName: authorization.user.name, action: 'Patient arrival recorded · bed occupied', entityType: 'admission', entityId: holdId, details: { patientName: admission?.patientName, bedCategory }, createdAt: admittedAt });
    return Response.json({ success: true, admission }, { status: 201 });
  }
  if (typeof body.hospitalRequestId !== 'string' || !body.hospitalRequestId.trim()) {
    return Response.json({ error: 'hospitalRequestId is required.' }, { status: 400 });
  }

  const { hospitalRequests, hospitalAdmissions, notifications } = await workflowCollections();
  const hospitalRequest = await hospitalRequests.findOne({ _id: body.hospitalRequestId.trim(), ...scope });
  if (!hospitalRequest) return Response.json({ error: 'Accepted request not found for this hospital.' }, { status: 404 });
  if (hospitalRequest.status !== 'accepted') return Response.json({ error: 'Accept the request and reserve a bed before recording admission.' }, { status: 409 });

  await hospitalAdmissions.createIndex({ hospitalRequestId: 1 }, { unique: true });
  const admittedAt = new Date();
  await hospitalAdmissions.updateOne(
    { hospitalRequestId: hospitalRequest._id },
    { $setOnInsert: {
      _id: hospitalRequest._id,
      hospitalRequestId: hospitalRequest._id,
      hospitalId: hospitalRequest.hospitalId,
      hospitalName: hospitalRequest.hospitalName,
      patientId: hospitalRequest.patientId,
      patientName: hospitalRequest.patientName,
      patientPhone: hospitalRequest.patientPhone,
      incidentType: hospitalRequest.incidentType,
      bedCategory: hospitalRequest.bedCategory,
      inventorySource: hospitalRequest.inventorySource,
      holdId: hospitalRequest.holdId,
      admittedAt,
    } },
    { upsert: true },
  );
  if (hospitalRequest.holdId) {
    const holds = await getHoldsCollection();
    const holdId = ObjectId.isValid(hospitalRequest.holdId) ? new ObjectId(hospitalRequest.holdId) : hospitalRequest.holdId;
    await holds.updateOne({ _id: holdId as never, status: 'confirmed' }, { $set: { status: 'fulfilled', fulfilledAt: admittedAt, updatedAt: admittedAt } });
  }
  const admission = await hospitalAdmissions.findOne({ hospitalRequestId: hospitalRequest._id });
  await writeHospitalAudit({ hospitalId: hospitalRequest.hospitalId, hospitalName: hospitalRequest.hospitalName, actorId: authorization.user.id, actorName: authorization.user.name, action: 'Patient arrival recorded · bed occupied', entityType: 'admission', entityId: hospitalRequest._id, details: { patientName: hospitalRequest.patientName, bedCategory: hospitalRequest.bedCategory }, createdAt: admittedAt });
  await notifications.updateOne(
    { _id: `hospital-admitted-${hospitalRequest._id}` },
    { $setOnInsert: {
      _id: `hospital-admitted-${hospitalRequest._id}`,
      recipientId: hospitalRequest.patientId,
      type: 'hospital_patient_admitted',
      title: 'Hospital recorded your admission',
      message: `${hospitalRequest.hospitalName} recorded your admission.`,
      relatedRequestId: hospitalRequest.sosRequestId,
      createdAt: admittedAt,
    } },
    { upsert: true },
  );
  return Response.json({ success: true, admission }, { status: 201 });
}
