import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAuthenticatedPage } from '../../lib/page-auth';

export default async function DriverDashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireAuthenticatedPage();
  const user = session.user as typeof session.user & {
    role?: string;
    licenseNumber?: string;
  };

  // Gate dashboard access if required driver details have not been submitted yet
  if (!user.licenseNumber?.trim()) {
    redirect('/onboarding/driver-details');
  }

  return children;
}
