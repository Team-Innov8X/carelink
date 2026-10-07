import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAuthenticatedPage } from '../../lib/page-auth';

export default async function HospitalAdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAuthenticatedPage();
  const user = session.user as typeof session.user & {
    role?: string;
    hospitalName?: string;
    hospitalAddress?: string;
  };

  // Gate dashboard access if required hospital details have not been submitted yet
  if (!user.hospitalName?.trim() || !user.hospitalAddress?.trim()) {
    redirect('/onboarding/hospital-details');
  }

  return children;
}
