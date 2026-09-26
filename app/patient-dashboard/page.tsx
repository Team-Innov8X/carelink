'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Heart, MapPin, Plus, ShieldCheck } from 'lucide-react';
import { CareLinkProvider, useCareLink } from '../../context/CareLinkContext';
import { MedicineSearch } from '../../components/pharmacy/MedicineSearch';

function PatientHome() {
  const { emergencies, createNewEmergency } = useCareLink();
  const [condition, setCondition] = useState('');
  const [notice, setNotice] = useState('');
  const myRequests = emergencies.filter((request) => request.patientName === 'My request');
  const submitRequest = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!condition.trim()) return;
    const requestId = createNewEmergency({ patientName: 'My request', condition: condition.trim() });
    setNotice(`Request ${requestId} sent to the emergency network.`);
    setCondition('');
  };
  return <main className="min-h-screen bg-slate-50"><header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-8"><div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Patient home</p></div></div><nav className="flex items-center gap-4 text-sm font-semibold"><Link href="/signin" className="text-slate-600 hover:text-sky-700">Sign in</Link><Link href="/signup" className="rounded-lg bg-sky-700 px-3 py-2 text-white hover:bg-sky-600">Create account</Link></nav></header><div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6"><section><p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Your care workspace</p><h1 className="text-3xl font-bold">How can we help?</h1><p className="mt-2 text-slate-500">Check medicine availability, request emergency support, and follow your requests.</p></section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><MedicineSearch mode="patient" /></section><div className="grid gap-6 lg:grid-cols-5"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"><h2 className="text-lg font-bold">Request emergency help</h2><p className="mt-1 text-sm text-slate-500">Describe what you need so nearby care teams can respond.</p><form onSubmit={submitRequest} className="mt-5 space-y-4"><label className="block text-sm font-medium">What is happening?<textarea required value={condition} onChange={(event) => setCondition(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Briefly describe the emergency" /></label><div className="flex items-center gap-2 text-xs text-slate-500"><MapPin className="h-4 w-4" /> Location will be confirmed by the response team.</div><button className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-500"><Plus className="h-4 w-4" /> Send request</button></form>{notice && <p role="status" className="mt-4 text-sm font-medium text-emerald-700">{notice}</p>}</section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3"><div className="mb-5 flex items-center gap-2"><Activity className="h-5 w-5 text-sky-700" /><h2 className="text-lg font-bold">My requests</h2></div>{myRequests.length ? <div className="space-y-3">{myRequests.map((request) => <article key={request.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><strong>{request.id}</strong><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{request.status}</span></div><p className="mt-2 text-sm text-slate-600">{request.condition}</p><p className="mt-2 text-xs text-slate-400">{request.requestedAt}</p></article>)}</div> : <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">No requests yet. Your emergency requests will appear here.</p>}</section></div></div></main>;
}

export default function PatientDashboardPage() {
  const [mounted, setMounted] = useState(false);
  // Defer the localStorage-backed demo provider until the client hydrates.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="min-h-screen bg-slate-50" aria-label="Loading patient dashboard" />;
  return <CareLinkProvider><PatientHome /></CareLinkProvider>;
}
