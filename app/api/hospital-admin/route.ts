import { requireRole, resolveHospitalId } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { workflowCollections } from '@/lib/sos';
import { writeHospitalAudit } from '@/lib/hospital-audit';
import { getHoldsCollection, getResourcesCollection } from '@/lib/models';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';

const bedTypes = ['general', 'icu', 'trauma', 'ventilators'] as const;
type BedType = typeof bedTypes[number];
type Bed = { total: number; available: number; reserved?: number; occupied?: number; lastUpdatedAt?: Date };
type HospitalDoctor = { id: string; name: string; specialty: string; available: boolean; addedAt: Date };
type AdminHospital = { id: string; name: string; beds: Record<BedType, Bed>; specialties?: string[]; specialtyDoctors?: Record<string, number>; doctors?: HospitalDoctor[]; acceptingRequests?: boolean; lastCapacityUpdatedAt?: Date; capacitySource?: string };

async function getAssignedHospital(hospitalName: string) {
  const client = await clientPromise;
  const state = await client.db().collection<{ _id: string; state?: { hospitals?: AdminHospital[] } }>('appState').findOne({ _id: 'carelink' });
  return state?.state?.hospitals?.find((hospital) => hospital.name.trim().toLocaleLowerCase() === hospitalName.trim().toLocaleLowerCase()) ?? null;
}

export async function GET() {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized || !authorization.user) {
    return Response.json({ error: authorization.reason }, { status: authorization.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const hospitalName = (authorization.user as typeof authorization.user & { hospitalName?: string }).hospitalName;
  if (!hospitalName) return Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 });
  const mongoClient = await clientPromise;
  const facility = await mongoClient.db().collection('hospitals').findOne({ ownerUserId: authorization.user.id }, { projection: { location: 1, address: 1 } });
  const hasAddress = Boolean(facility?.location && facility?.address);
  const hospital = await getAssignedHospital(hospitalName);
  if (hospital) {
    const { hospitalRequests, hospitalAdmissions } = await workflowCollections();
    const requests = await hospitalRequests.find({ hospitalId: hospital.id, status: 'accepted' }).project({ _id: 1, bedCategory: 1, holdId: 1, inventorySource: 1 }).toArray();
    const admissions = requests.length ? await hospitalAdmissions.find({ hospitalRequestId: { $in: requests.map((item) => item._id) } }).project({ hospitalRequestId: 1, dischargedAt: 1 }).toArray() : [];
    const activeIds = new Set(admissions.filter((item) => !item.dischargedAt).map((item) => item.hospitalRequestId));
    const everAdmittedIds = new Set(admissions.map((item) => item.hospitalRequestId));
    const reservedByType = new Map<string, number>();
    const occupiedByType = new Map<string, number>();
    const mongoWorkflowCounts = new Map<string, number>();
    const linkedHoldIds = new Set(requests.flatMap((item) => item.holdId ? [item.holdId] : []));
    for (const item of requests) if (item.bedCategory) {
      if (everAdmittedIds.has(item._id) && !activeIds.has(item._id)) continue;
      const target = activeIds.has(item._id) ? occupiedByType : reservedByType;
      target.set(item.bedCategory, (target.get(item.bedCategory) ?? 0) + 1);
      if (item.inventorySource !== 'app-state' && item.holdId) mongoWorkflowCounts.set(item.bedCategory, (mongoWorkflowCounts.get(item.bedCategory) ?? 0) + 1);
    }
    const linkedHospitalId = await resolveHospitalId(authorization.user as typeof authorization.user & { hospitalId?: string; hospitalName?: string });
    let acceptedHoldCounts = new Map<string, number>();
    if (linkedHospitalId) {
      const activeHolds = await (await getHoldsCollection()).find({ hospitalId: linkedHospitalId, status: { $in: ['confirmed', 'fulfilled'] } }).toArray();
      const holds = activeHolds.filter((hold) => !linkedHoldIds.has(hold._id?.toString() ?? hold.id ?? ''));
      const resources = await getResourcesCollection();
      const resourceIds = [...new Set(holds.map((hold) => hold.resourceId))];
      const resourceRows = resourceIds.length ? await resources.find({ _id: { $in: resourceIds.map((id) => ObjectId.isValid(id) ? new ObjectId(id) : id as never) } }).project({ category: 1 }).toArray() : [];
      const categoryById = new Map(resourceRows.map((resource) => [String(resource._id), String(resource.category).toLowerCase()]));
      acceptedHoldCounts = new Map();
      for (const hold of holds) {
        const category = categoryById.get(hold.resourceId) ?? 'general';
        const bedType = category === 'icu' ? 'icu' : category === 'trauma' || category === 'pediatric' ? 'trauma' : category === 'ventilator' || category === 'ventilators' ? 'ventilators' : 'general';
        acceptedHoldCounts.set(bedType, (acceptedHoldCounts.get(bedType) ?? 0) + hold.quantity);
      }
    }
    const enriched = { ...hospital, acceptingRequests: hospital.acceptingRequests !== false, lastCapacityUpdatedAt: hospital.lastCapacityUpdatedAt, beds: Object.fromEntries(Object.entries(hospital.beds).map(([key, bed]) => {
      const workflowReserved = reservedByType.get(key) ?? 0;
      const workflowOccupied = occupiedByType.get(key) ?? 0;
      const heldOccupancy = acceptedHoldCounts.get(key) ?? 0;
      const available = Math.max(0, bed.available - heldOccupancy - (mongoWorkflowCounts.get(key) ?? 0));
      const reserved = workflowReserved;
      const occupied = workflowOccupied + heldOccupancy;
      return [key, { ...bed, available, reserved, occupied: Math.max(occupied, Math.max(0, bed.total - available - reserved)) }];
    })) };
    return Response.json({ hospital: enriched, hasAddress });
  }
  return hospital
    ? Response.json({ hospital, hasAddress })
    : Response.json({ error: 'No bed capacity record is linked to your hospital account.' }, { status: 404 });
}

export async function PATCH(request: Request) {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized || !authorization.user) {
    return Response.json({ error: authorization.reason }, { status: authorization.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const hospitalName = (authorization.user as typeof authorization.user & { hospitalName?: string }).hospitalName;
  if (!hospitalName) return Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 });
  let body: { action?: unknown; acceptingRequests?: unknown; bedType?: unknown; total?: unknown; available?: unknown; specialty?: unknown; doctorCount?: unknown; removeSpecialty?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  if (body.action === 'accepting' || body.action === 'reconfirm' || body.action === 'simulate-stale') {
    if (body.action === 'accepting' && typeof body.acceptingRequests !== 'boolean') return Response.json({ error: 'Choose accepting or diverted.' }, { status: 400 });
    const hospital = await getAssignedHospital(hospitalName);
    if (!hospital) return Response.json({ error: 'No hospital record is linked to your account.' }, { status: 404 });
    const now = new Date();
    const set = body.action === 'reconfirm' ? { lastCapacityUpdatedAt: now, capacitySource: 'staff-confirmed', updatedAt: now } : body.action === 'simulate-stale' ? { lastCapacityUpdatedAt: new Date(now.getTime() - 60 * 60_000), capacitySource: 'auto-simulated', updatedAt: now } : { acceptingRequests: body.acceptingRequests, updatedAt: now };
    const client = await clientPromise;
    const updates = Object.fromEntries(Object.entries(set).map(([key, value]) => [`state.hospitals.$[hospital].${key}`, value]));
    if (body.action === 'reconfirm') for (const bedType of bedTypes) updates[`state.hospitals.$[hospital].beds.${bedType}.lastUpdatedAt`] = now;
    await client.db().collection<{ _id: string }>('appState').updateOne({ _id: 'carelink', 'state.hospitals.id': hospital.id }, { $set: updates }, { arrayFilters: [{ 'hospital.id': hospital.id }] });
    const actor = authorization.user;
    await writeHospitalAudit({ hospitalId: hospital.id, hospitalName: hospital.name, actorId: actor.id, actorName: actor.name, action: body.action === 'reconfirm' ? 'Availability re-confirmed' : body.action === 'simulate-stale' ? 'Demo: stale capacity simulated' : body.acceptingRequests ? 'Hospital accepting requests' : 'Hospital diverted', entityType: 'hospital', details: {}, createdAt: now });
    return Response.json({ success: true, acceptingRequests: body.action === 'accepting' ? body.acceptingRequests : hospital.acceptingRequests !== false, lastCapacityUpdatedAt: set.lastCapacityUpdatedAt ?? hospital.lastCapacityUpdatedAt ?? null, capacitySource: set.capacitySource ?? hospital.capacitySource ?? 'unconfirmed' });
  }

  if (body.specialty !== undefined || body.removeSpecialty !== undefined) {
    const removing = body.removeSpecialty !== undefined;
    const rawName = removing ? body.removeSpecialty : body.specialty;
    if (typeof rawName !== 'string' || !rawName.trim() || rawName.trim().length > 60 || /[.$]/.test(rawName)) {
      return Response.json({ error: 'Provide a specialty name of 1–60 characters without dots or dollar signs.' }, { status: 400 });
    }
    if (!removing && (!Number.isInteger(body.doctorCount) || (body.doctorCount as number) < 0 || (body.doctorCount as number) > 10000)) {
      return Response.json({ error: 'Doctor count must be a whole number between 0 and 10,000.' }, { status: 400 });
    }
    const hospital = await getAssignedHospital(hospitalName);
    if (!hospital) return Response.json({ error: 'No hospital record is linked to your account.' }, { status: 404 });
    const currentSpecialties = hospital.specialties ?? [];
    const specialty = currentSpecialties.find((item) => item.toLocaleLowerCase() === rawName.trim().toLocaleLowerCase()) ?? rawName.trim();
    if (removing && !currentSpecialties.some((item) => item.toLocaleLowerCase() === specialty.toLocaleLowerCase())) {
      return Response.json({ error: 'That specialty is not on this hospital roster.' }, { status: 404 });
    }
    const client = await clientPromise;
    const collection = client.db().collection<{ _id: string; state?: { hospitals?: AdminHospital[] } }>('appState');
    const filter = { _id: 'carelink', 'state.hospitals': { $elemMatch: { id: hospital.id, name: hospital.name } } };
    const result = removing
      ? await collection.updateOne(filter, {
          $pull: { 'state.hospitals.$[hospital].specialties': specialty },
          $unset: { [`state.hospitals.$[hospital].specialtyDoctors.${specialty}`]: '' },
          $set: { updatedAt: new Date() },
        }, { arrayFilters: [{ 'hospital.id': hospital.id }] })
      : await collection.updateOne(filter, {
          $addToSet: { 'state.hospitals.$[hospital].specialties': specialty },
          $set: { [`state.hospitals.$[hospital].specialtyDoctors.${specialty}`]: body.doctorCount, updatedAt: new Date() },
        }, { arrayFilters: [{ 'hospital.id': hospital.id }] });
    if (!result.matchedCount) return Response.json({ error: 'Hospital data changed. Refresh and try again.' }, { status: 409 });
    const updatedHospital = await getAssignedHospital(hospitalName);
    return Response.json({ success: true, hospital: updatedHospital });
  }

  if (typeof body.bedType !== 'string' || !bedTypes.includes(body.bedType as BedType) || !Number.isInteger(body.total) || !Number.isInteger(body.available) || (body.total as number) < 0 || (body.available as number) < 0 || (body.available as number) > (body.total as number)) {
    return Response.json({ error: 'Provide a valid bed type and non-negative integer capacity values with available beds no greater than total.' }, { status: 400 });
  }

  const hospital = await getAssignedHospital(hospitalName);
  if (!hospital) return Response.json({ error: 'No bed capacity record is linked to your hospital account.' }, { status: 404 });
  const bedType = body.bedType as BedType;
  const oldBed = hospital.beds[bedType];
  const total = body.total as number;
  const available = body.available as number;
  const occupied = oldBed.total - oldBed.available;
  if (total < occupied) return Response.json({ error: `Total capacity cannot be less than the ${occupied} currently occupied beds.` }, { status: 400 });

  const client = await clientPromise;
  const collection = client.db().collection<{ _id: string; state?: { hospitals?: AdminHospital[] } }>('appState');
  const result = await collection.updateOne(
    { _id: 'carelink', state: { $exists: true }, 'state.hospitals': { $elemMatch: { name: hospital.name, [`beds.${bedType}.total`]: oldBed.total, [`beds.${bedType}.available`]: oldBed.available } } },
    { $set: { [`state.hospitals.$[hospital].beds.${bedType}`]: { total, available }, updatedAt: new Date() } },
    { arrayFilters: [{ 'hospital.name': hospital.name }] },
  );
  if (!result.matchedCount) return Response.json({ error: 'Hospital data changed. Refresh and try again.' }, { status: 409 });
  const now = new Date();
  await collection.updateOne({ _id: 'carelink', 'state.hospitals.id': hospital.id }, { $set: { 'state.hospitals.$[hospital].lastCapacityUpdatedAt': now, 'state.hospitals.$[hospital].capacitySource': 'staff-confirmed', [`state.hospitals.$[hospital].beds.${bedType}.lastUpdatedAt`]: now } }, { arrayFilters: [{ 'hospital.id': hospital.id }] });
  await writeHospitalAudit({ hospitalId: hospital.id, hospitalName: hospital.name, actorId: authorization.user.id, actorName: authorization.user.name, action: 'Bed inventory adjusted', entityType: 'bed', details: { bedType, old: oldBed, new: { total, available } }, createdAt: now });
  return Response.json({ success: true, bed: { total, available } });
}
