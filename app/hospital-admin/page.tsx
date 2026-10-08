import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth-utils';
import HospitalAdminDashboard from './dashboard';

export default async function HospitalAdminPage() {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized) {
    redirect(authorization.reason === 'UNAUTHENTICATED' ? '/signin' : '/');
  }
  const profile = authorization.user as typeof authorization.user & { hospitalName?: string };
  return <HospitalAdminDashboard hospitalName={profile.hospitalName || ''} />;
}
