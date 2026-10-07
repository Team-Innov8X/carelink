import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-utils';
import { routeForRole } from '@/lib/role-route';

export const dynamic = 'force-dynamic';

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const session = await getServerSession();
  if (!session?.user) {
    redirect('/signin');
  }

  const { role: requestedRole } = await searchParams;
  const user = session.user as typeof session.user & {
    role?: string;
    hospitalName?: string;
    hospitalAddress?: string;
    pharmacyName?: string;
    pharmacyAddress?: string;
    licenseNumber?: string;
  };

  const userRole = requestedRole || user.role || 'patient';

  if (userRole === 'hospital' || userRole === 'hospital_staff') {
    if (!user.hospitalName?.trim() || !user.hospitalAddress?.trim()) {
      redirect('/onboarding/hospital-details');
    }
    redirect('/hospital-admin');
  }

  if (userRole === 'pharmacy') {
    if (!user.pharmacyName?.trim() || !user.pharmacyAddress?.trim()) {
      redirect('/onboarding/pharmacy-details');
    }
    redirect('/pharmacy-dashboard');
  }

  if (userRole === 'driver' || userRole === 'ambulance_driver') {
    if (!user.licenseNumber?.trim()) {
      redirect('/onboarding/driver-details');
    }
    redirect('/driver-dashboard');
  }

  redirect(routeForRole(userRole));
}
