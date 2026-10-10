import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth-utils';
import HospitalAdminDashboard from './dashboard';
import { getUsersCollection } from '@/lib/models';

export default async function HospitalAdminPage() {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized) {
    redirect(authorization.reason === 'UNAUTHENTICATED' ? '/signin' : '/');
  }
  const profile = authorization.user as typeof authorization.user & { hospitalName?: string };
  const persisted = await (await getUsersCollection()).findOne({ _id: authorization.user.id as never }, { projection: { onboardingCompleted: 1 } });
  if (persisted?.onboardingCompleted !== true) redirect('/onboarding/hospital');
  return <HospitalAdminDashboard hospitalName={profile.hospitalName || ''} />;
}
