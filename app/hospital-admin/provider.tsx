'use client';

import { CareLinkProvider } from '@/context/CareLinkContext';

export default function HospitalAdminProvider({ children }: { children: React.ReactNode }) {
  return <CareLinkProvider initialRole="hospital">{children}</CareLinkProvider>;
}
