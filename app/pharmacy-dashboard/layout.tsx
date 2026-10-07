import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAuthenticatedPage } from '../../lib/page-auth';

export default async function PharmacyDashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireAuthenticatedPage();
  const user = session.user as typeof session.user & {
    role?: string;
    pharmacyName?: string;
    pharmacyAddress?: string;
  };

  // Gate dashboard access if required pharmacy details have not been submitted yet
  if (!user.pharmacyName?.trim() || !user.pharmacyAddress?.trim()) {
    redirect('/onboarding/pharmacy-details');
  }

  return children;
}
