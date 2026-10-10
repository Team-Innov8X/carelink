import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireRole } from '@/lib/auth-utils';
import HospitalAdminDashboard from './dashboard';
import HospitalAdminProvider from './provider';
import { getHospitalsCollection, getUsersCollection } from '@/lib/models';

export default async function HospitalAdminPage() {
  await connection();
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized) {
    redirect(authorization.reason === 'UNAUTHENTICATED' ? '/signin' : '/');
  }
  const profile = authorization.user as typeof authorization.user & { hospitalName?: string };
  const users = await getUsersCollection();
  const userId = authorization.user.id;
  const persisted = await users.findOne({ _id: userId as never }, { projection: { onboardingCompleted: 1 } });
  if (persisted?.onboardingCompleted !== true) {
    // Older deployments could save the hospital record before updating the
    // user's onboarding flag. Treat an already-owned facility as complete so
    // existing hospital accounts are not sent through setup again on sign-in.
    const existingHospital = await (await getHospitalsCollection()).findOne(
      { ownerUserId: userId },
      { projection: { _id: 1 } },
    );
    if (!existingHospital) redirect('/onboarding/hospital');
    await users.updateOne(
      { _id: userId as never },
      { $set: { onboardingCompleted: true, updatedAt: new Date() } },
    );
  }
  return <HospitalAdminProvider><HospitalAdminDashboard hospitalName={profile.hospitalName || ''} /></HospitalAdminProvider>;
}
