'use client';

import { useEffect, useState } from 'react';
import { Heart, Store } from 'lucide-react';
import { CareLinkProvider } from '../../context/CareLinkContext';
import { MedicineSearch } from '../../components/pharmacy/MedicineSearch';

export default function PharmacyDashboardPage() {
  const [mounted, setMounted] = useState(false);
  // Defer the localStorage-backed demo provider until the client hydrates.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="min-h-screen bg-slate-50" aria-label="Loading pharmacy dashboard" />;
  return <CareLinkProvider><main className="min-h-screen bg-slate-50"><header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Pharmacy workspace</p></div></div></header><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-purple-100 p-3 text-purple-700"><Store /></span><div><h1 className="text-2xl font-bold">Pharmacy dashboard</h1><p className="text-sm text-slate-500">Manage medicine availability and emergency orders.</p></div></div><MedicineSearch /></div></main></CareLinkProvider>;
}
