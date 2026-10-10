'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from '@/components/icons';
import { CareLinkProvider } from '../../context/CareLinkContext';
import { PharmacyInventory } from '../../components/pharmacy/PharmacyInventory';
import { ProfileMenu } from '../../components/common/ProfileMenu';
import { authClient } from '../../lib/auth-client';

export default function PharmacyDashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  // Defer the localStorage-backed demo provider until the client hydrates.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (isPending) return;
    if (!session) { router.replace('/signin'); return; }
    const profile = session.user as typeof session.user & { onboardingCompleted?: boolean; role?: string; pharmacyName?: string; pharmacyLicenseNumber?: string };
    if (profile.role === 'pharmacy' || (profile.pharmacyName && profile.pharmacyLicenseNumber)) void fetch('/api/onboarding', { cache: 'no-store' }).then(response => response.json()).then(result => { if (!result.onboardingCompleted) router.replace('/onboarding/pharmacy'); }).catch(() => router.replace('/onboarding/pharmacy'));
  }, [isPending, router, session]);
  if (!mounted) return <main className="min-h-screen bg-slate-50" aria-label="Loading pharmacy dashboard" />;
  return <CareLinkProvider initialRole="pharmacy"><main className="min-h-screen bg-slate-50"><header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Pharmacy workspace</p></div></div><ProfileMenu /></header><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><PharmacyInventory /></div></main></CareLinkProvider>;
}


