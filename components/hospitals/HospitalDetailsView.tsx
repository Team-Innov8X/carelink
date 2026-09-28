'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, BedDouble, Building2, Phone, Stethoscope } from 'lucide-react';
import { useCareLink } from '../../context/CareLinkContext';
import type { Hospital } from '../../types';

export function HospitalDetailsView() {
  const { selectedHospitalId, setActiveTab } = useCareLink();
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/data', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load hospital data.');
        const match = (result.state?.hospitals as Hospital[] | undefined)?.find((item) => item.id === selectedHospitalId);
        if (!match) throw new Error('Hospital was not found in backend data.');
        if (!cancelled) setHospital(match);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load hospital data.'); });
    return () => { cancelled = true; };
  }, [selectedHospitalId]);

  return <section className="mx-auto max-w-4xl space-y-5">
    <button onClick={() => setActiveTab('hospitals')} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to hospitals</button>
    {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : !hospital ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading hospital details…</p> : <>
      <header className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-start gap-4"><span className="rounded-xl bg-sky-100 p-3 text-sky-700"><Building2 /></span><div><h1 className="text-2xl font-bold text-slate-900">{hospital.name}</h1><p className="mt-1 text-sm text-slate-500">{hospital.location.address}</p><p className="mt-2 text-sm font-semibold text-emerald-700">{hospital.status}</p></div></div></header>
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 font-bold"><BedDouble className="h-5 w-5 text-sky-700" />Bed availability</h2><div className="space-y-3">{Object.entries(hospital.beds).map(([key, bed]) => <div key={key} className="flex justify-between border-b border-slate-100 pb-2 text-sm"><span className="capitalize text-slate-600">{key}</span><span className="font-semibold text-slate-900">{bed.available} available / {bed.total}</span></div>)}</div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 font-bold"><Stethoscope className="h-5 w-5 text-violet-700" />Specialties</h2><div className="flex flex-wrap gap-2">{hospital.specialties.map((specialty) => <span key={specialty} className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800">{specialty}</span>)}</div>{hospital.phone && <p className="mt-5 flex items-center gap-2 text-sm text-slate-600"><Phone className="h-4 w-4" />{hospital.phone}</p>}</article>
      </div>
    </>}
  </section>;
}
