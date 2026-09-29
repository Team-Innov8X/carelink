import type { ReactNode } from 'react';
import { requireAuthenticatedPage } from '../../lib/page-auth';

export default async function DriverDashboardLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedPage();
  return children;
}
