'use client';

import { useEffect, useState } from 'react';
import { Ambulance, Heart, MapPin } from 'lucide-react';
import { CareLinkProvider, useCareLink } from '../../context/CareLinkContext';

function DriverHome() {
  const { emergencies } = useCareLink();
  const assigned = emergencies.filter((request) => request.assignedAmbulanceId && request.status !== 'Completed' && request.status !== 'Rejected');
  return <main className="min-h-screen bg-slate-50"><header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Driver workspace</p></div></div></header><div className="mx-auto max-w-5xl px-4 py-10 sm:px-6"><div className="flex items-center gap-3"><span className="rounded-xl bg-amber-100 p-3 text-amber-700"><Ambulance /></span><div><h1 className="text-3xl font-bold">Driver dashboard</h1><p className="text-sm text-slate-500">Review ambulance assignments and patient destinations.</p></div></div><section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Active assignments</h2>{assigned.length ? <div className="mt-4 space-y-3">{assigned.map((request) => <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-semibold">{request.id} · {request.condition}</p><p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-4 w-4" />{request.location.address}</p></div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{request.status}</span></article>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No active ambulance assignments right now.</p>}</section></div></main>;
}

export default function DriverDashboardPage() {
  const [mounted, setMounted] = useState(false);
  // Defer the localStorage-backed demo provider until the client hydrates.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="min-h-screen bg-slate-50" aria-label="Loading driver dashboard" />;
  return <CareLinkProvider><DriverHome /></CareLinkProvider>;
}
