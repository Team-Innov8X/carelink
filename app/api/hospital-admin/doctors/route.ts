import { randomUUID } from 'node:crypto';
import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { hospitalSpecialties } from '@/data/hospitalSpecialties';
import { writeHospitalAudit } from '@/lib/hospital-audit';

export const runtime = 'nodejs';

type HospitalDoctor = { id: string; name: string; specialty: string; available: boolean; addedAt: Date; shiftStart?: string; shiftEnd?: string; onCall?: boolean };
type AdminHospital = { id: string; name: string; doctors?: HospitalDoctor[]; specialties?: string[] };

async function getAccountHospital() {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized || !authorization.user) {
    return { response: Response.json({ error: authorization.reason }, { status: authorization.reason === 'UNAUTHENTICATED' ? 401 : 403 }) };
  }
  const hospitalName = (authorization.user as typeof authorization.user & { hospitalName?: string }).hospitalName?.trim();
  if (!hospitalName) return { response: Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 }) };
  const client = await clientPromise;
  const collection = client.db().collection<{ _id: string; state?: { hospitals?: AdminHospital[] } }>('appState');
  const stored = await collection.findOne({ _id: 'carelink' });
  const hospital = stored?.state?.hospitals?.find((item) => item.name.trim().toLocaleLowerCase() === hospitalName.toLocaleLowerCase());
  if (!hospital) return { response: Response.json({ error: 'No hospital record is linked to your account.' }, { status: 404 }) };
  return { collection, hospital };
}

export async function POST(request: Request) {
  const account = await getAccountHospital();
  if ('response' in account) return account.response;
  let body: { name?: unknown; specialty?: unknown; available?: unknown; shiftStart?: unknown; shiftEnd?: unknown; onCall?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const submittedSpecialty = typeof body.specialty === 'string' ? body.specialty.trim() : '';
  if (!name || name.length > 80 || !hospitalSpecialties.some((item) => item.toLocaleLowerCase() === submittedSpecialty.toLocaleLowerCase())) {
    return Response.json({ error: 'Enter a doctor name and choose a specialty from the shared list.' }, { status: 400 });
  }
  const specialty = hospitalSpecialties.find((item) => item.toLocaleLowerCase() === submittedSpecialty.toLocaleLowerCase())!;
  if (body.available !== undefined && typeof body.available !== 'boolean') return Response.json({ error: 'Availability must be true or false.' }, { status: 400 });
  if ((body.shiftStart !== undefined && (typeof body.shiftStart !== 'string' || !/^\d{2}:\d{2}$/.test(body.shiftStart))) || (body.shiftEnd !== undefined && (typeof body.shiftEnd !== 'string' || !/^\d{2}:\d{2}$/.test(body.shiftEnd))) || (body.onCall !== undefined && typeof body.onCall !== 'boolean')) return Response.json({ error: 'Provide valid shift times and on-call status.' }, { status: 400 });
  const doctor: HospitalDoctor = { id: randomUUID(), name, specialty, available: body.available !== false, addedAt: new Date(), shiftStart: typeof body.shiftStart === 'string' ? body.shiftStart : undefined, shiftEnd: typeof body.shiftEnd === 'string' ? body.shiftEnd : undefined, onCall: body.onCall === true };
  const result = await account.collection.updateOne(
    { _id: 'carelink', 'state.hospitals': { $elemMatch: { id: account.hospital.id, name: account.hospital.name } } },
    { $push: { 'state.hospitals.$[hospital].doctors': doctor }, $addToSet: { 'state.hospitals.$[hospital].specialties': specialty }, $set: { updatedAt: new Date() } },
    { arrayFilters: [{ 'hospital.id': account.hospital.id }] },
  );
  if (!result.matchedCount) return Response.json({ error: 'Hospital data changed. Refresh and try again.' }, { status: 409 });
  const auth = await requireRole(['hospital_staff', 'hospital']);
  if (auth.authorized && auth.user) await writeHospitalAudit({ hospitalId: account.hospital.id, hospitalName: account.hospital.name, actorId: auth.user.id, actorName: auth.user.name, action: 'Doctor added', entityType: 'doctor', entityId: doctor.id, details: { name, specialty, shiftStart: doctor.shiftStart, shiftEnd: doctor.shiftEnd, onCall: doctor.onCall }, createdAt: doctor.addedAt });
  return Response.json({ success: true, doctor });
}

export async function PATCH(request: Request) {
  const account = await getAccountHospital();
  if ('response' in account) return account.response;
  let body: { doctorId?: unknown; available?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (typeof body.doctorId !== 'string' || !body.doctorId.trim() || typeof body.available !== 'boolean') {
    return Response.json({ error: 'Provide a doctor ID and availability state.' }, { status: 400 });
  }
  const result = await account.collection.updateOne(
    { _id: 'carelink', 'state.hospitals': { $elemMatch: { id: account.hospital.id, name: account.hospital.name, 'doctors.id': body.doctorId } } },
    { $set: { 'state.hospitals.$[hospital].doctors.$[doctor].available': body.available, updatedAt: new Date() } },
    { arrayFilters: [{ 'hospital.id': account.hospital.id }, { 'doctor.id': body.doctorId }] },
  );
  if (!result.matchedCount) return Response.json({ error: 'Doctor not found for this hospital.' }, { status: 404 });
  const auth = await requireRole(['hospital_staff', 'hospital']);
  if (auth.authorized && auth.user) await writeHospitalAudit({ hospitalId: account.hospital.id, hospitalName: account.hospital.name, actorId: auth.user.id, actorName: auth.user.name, action: `Doctor marked ${body.available ? 'available' : 'unavailable'}`, entityType: 'doctor', entityId: body.doctorId, details: {}, createdAt: new Date() });
  return Response.json({ success: true });
}

export async function DELETE(request: Request) {
  const account = await getAccountHospital();
  if ('response' in account) return account.response;
  let body: { doctorId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (typeof body.doctorId !== 'string' || !body.doctorId.trim()) return Response.json({ error: 'Provide a doctor ID.' }, { status: 400 });
  const result = await account.collection.updateOne(
    { _id: 'carelink', 'state.hospitals': { $elemMatch: { id: account.hospital.id, name: account.hospital.name, 'doctors.id': body.doctorId } } },
    { $pull: { 'state.hospitals.$[hospital].doctors': { id: body.doctorId } }, $set: { updatedAt: new Date() } },
    { arrayFilters: [{ 'hospital.id': account.hospital.id }] },
  );
  if (!result.matchedCount) return Response.json({ error: 'Doctor not found for this hospital.' }, { status: 404 });
  const auth = await requireRole(['hospital_staff', 'hospital']);
  if (auth.authorized && auth.user) await writeHospitalAudit({ hospitalId: account.hospital.id, hospitalName: account.hospital.name, actorId: auth.user.id, actorName: auth.user.name, action: 'Doctor removed', entityType: 'doctor', entityId: body.doctorId, details: {}, createdAt: new Date() });
  return Response.json({ success: true });
}
