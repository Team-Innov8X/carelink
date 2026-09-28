'use client';

import { Activity, ArrowRight, Building2, Pill, Siren } from 'lucide-react';
import { useCareLink } from '../../context/CareLinkContext';

export function PatientDashboard() {
  const { hospitals, medicines, setActiveTab } = useCareLink();
  const openHospitals = hospitals.filter((hospital) => hospital.status !== 'Full').length;
  const inStockMedicines = medicines.filter((medicine) =>
    Object.values(medicine.stock).some((quantity) => quantity > 0)
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 p-6 text-white shadow-lg sm:p-8">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-rose-200">CareLink patient dashboard</p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Your care, all in one place.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Find nearby hospitals, check medicine availability, and follow your emergency requests.</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-rose-100">
            <Siren className="h-4 w-4" /> In an emergency, use the SOS button at the bottom of the screen.
          </div>
        </div>
      </section>

      <section aria-label="Care services" className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => setActiveTab('hospitals')} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100">
          <div className="flex items-start justify-between gap-4">
            <span className="rounded-xl bg-sky-50 p-3 text-sky-700"><Building2 className="h-5 w-5" /></span>
            <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-700" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-slate-900">Find a hospital</h2>
          <p className="mt-1 text-sm text-slate-500">View nearby facilities and current bed availability.</p>
          <p className="mt-4 text-xs font-bold text-sky-800">{openHospitals} facilities with availability</p>
        </button>

        <button type="button" onClick={() => setActiveTab('pharmacy')} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-100">
          <div className="flex items-start justify-between gap-4">
            <span className="rounded-xl bg-violet-50 p-3 text-violet-700"><Pill className="h-5 w-5" /></span>
            <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-violet-700" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-slate-900">Medicine & pharmacy</h2>
          <p className="mt-1 text-sm text-slate-500">Check local stock and send a request to a pharmacy.</p>
          <p className="mt-4 text-xs font-bold text-violet-800">{inStockMedicines} medicines currently listed in stock</p>
        </button>
      </section>

      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
        <Activity className="h-4 w-4 shrink-0" /> Your active emergency requests and hospital updates appear here when available.
      </div>
    </div>
  );
}
