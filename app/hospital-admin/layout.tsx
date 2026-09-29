import type { ReactNode } from 'react';
import { requireAuthenticatedPage } from '../../lib/page-auth';

export default async function HospitalAdminLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedPage();
  return children;
}
