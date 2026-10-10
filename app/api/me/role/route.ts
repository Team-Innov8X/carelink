import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-utils';
import { getUsersCollection } from '@/lib/models';
import { isSelfServiceRole } from '@/lib/roles';
import { ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongodb';

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  let body: { role?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!isSelfServiceRole(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  const users = await getUsersCollection();
  const id = session.user.id;
  const identifiers = [{ _id: id as never }, { id }];
  if (ObjectId.isValid(id)) identifiers.unshift({ _id: new ObjectId(id) as never });
  const account = await users.findOne({ $or: identifiers } as never);
  if (!account) return NextResponse.json({ error: 'Could not find your account to set its role.' }, { status: 404 });
  const profile = account as typeof account & { pharmacyName?: string; pharmacyLicenseNumber?: string; pharmacyAddress?: string; pharmacyId?: string; hospitalName?: string; hospitalAddress?: string; hospitalRegistrationNumber?: string; hospitalSpecialties?: string; phone?: string; email?: string };
  const pharmacyProfileComplete = Boolean(profile.pharmacyName?.trim() && profile.pharmacyAddress?.trim() && (profile.pharmacyLicenseNumber?.trim() || profile.pharmacyId));
  if (account.role !== body.role && (account.role !== 'patient' || (account.onboardingCompleted && !(body.role === 'pharmacy' && pharmacyProfileComplete)))) {
    return NextResponse.json({ error: 'This account already has a different role.' }, { status: 409 });
  }
  if (account.role !== body.role) {
    const accountIdFilter = account._id ? { _id: account._id } : { id };
    const updated = await users.updateOne(accountIdFilter as never, { $set: { role: body.role, updatedAt: new Date() } } as never);
    if (!updated.modifiedCount) return NextResponse.json({ error: 'Your account role could not be updated.' }, { status: 409 });
  }
  if (body.role === 'hospital_staff' && profile.hospitalName?.trim()) {
    const now = new Date();
    const db = (await clientPromise).db();
    await db.collection('hospitals').updateOne(
      { ownerUserId: id },
      { $setOnInsert: {
        name: profile.hospitalName.trim(),
        code: `HOSP-${new ObjectId().toHexString().slice(-8).toUpperCase()}`,
        address: { street: profile.hospitalAddress?.trim() || '', city: '', state: '', zipCode: '', country: 'India' },
        contact: { phone: profile.phone || '', email: profile.email || account.email || '', emergencyHotline: profile.phone || '' },
        specialties: (profile.hospitalSpecialties || '').split(',').map((value) => value.trim()).filter(Boolean),
        capacitySummary: { totalBeds: 0, availableBeds: 0, totalVentilators: 0, availableVentilators: 0 },
        status: 'active', isDemo: false, ownerUserId: id, createdAt: now, updatedAt: now,
      } },
      { upsert: true },
    );
    const hospital = await db.collection('hospitals').findOne({ ownerUserId: id }, { projection: { _id: 1 } });
    if (hospital?._id) await users.updateOne({ $or: identifiers } as never, { $set: { hospitalId: String(hospital._id), onboardingCompleted: true, updatedAt: now } } as never);
  }
  return NextResponse.json({ role: body.role });
}
