'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Heart, Plus, Save, ShieldCheck, BedDouble } from 'lucide-react';
import { CareLinkProvider, useCareLink } from '../../context/CareLinkContext';
import { HospitalStaffView } from '../../components/hospitalStaff/HospitalStaffView';
import { ProfileMenu } from '../../components/common/ProfileMenu';
import { HospitalBeds } from '../../types';

function BedCapacityCard() {
  const { hospitals, setBedAvailability } = useCareLink();
  const hospital = hospitals[0];
  if (!hospital) return null;
  const types: { key: keyof HospitalBeds; label: string }[] = [
    { key: 'general', label: 'General beds' }, { key: 'icu', label: 'ICU beds' },
    { key: 'trauma', label: 'Trauma beds' }, { key: 'ventilators', label: 'Ventilation beds' },
  ];
  return <section className="mx-auto mb-6 max-w-6xl rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white shadow-xl shadow-slate-900/15">
    <div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-sky-400/15 p-2.5 text-sky-300"><BedDouble className="h-5 w-5" /></span><div><h2 className="font-bold">Bed capacity</h2><p className="text-xs text-slate-400">Adjust total beds and currently available capacity.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{types.map(({ key, label }) => {
      const bed = hospital.beds[key];
      return <div key={key} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">{label}</span><span className="text-xs text-sky-300">{bed.available} available</span></div>
        <label className="text-xs text-slate-400">Total capacity<input type="number" min={bed.available} value={bed.total} onChange={(event) => setBedAvailability(hospital.id, key, bed.available, Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" /></label>
      </div>;
    })}</div>
  </section>;
}

function SpecialtyManagement() {
  const { hospitals, updateHospitalSpecialty } = useCareLink();
  const hospital = hospitals[0];
  const [specialtyName, setSpecialtyName] = useState('');

  if (!hospital) return null;

  const addSpecialty = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!specialtyName.trim()) return;
    updateHospitalSpecialty(hospital.id, specialtyName, 0);
    setSpecialtyName('');
  };

  return (
    <section className="mx-auto mt-6 max-w-6xl rounded-2xl border border-violet-200 bg-violet-50 p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-bold text-violet-950">Doctors by specialty</h2>
        <p className="mt-1 text-xs text-slate-500">Set available doctor counts for {hospital.name}, or add a specialty that is not listed.</p>
      </div>
      <div className="space-y-3">
        {hospital.specialties.map((specialty) => (
          <label key={specialty} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-800">
            <span>{specialty}</span>
            <span className="flex items-center gap-2 text-xs font-medium text-slate-500">Doctors available
              <input aria-label={`${specialty} doctors available`} type="number" min="0" value={hospital.specialtyDoctors?.[specialty] ?? 0} onChange={(event) => updateHospitalSpecialty(hospital.id, specialty, Number(event.target.value))} className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm text-slate-900" />
            </span>
          </label>
        ))}
      </div>
      <form onSubmit={addSpecialty} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input value={specialtyName} onChange={(event) => setSpecialtyName(event.target.value)} placeholder="New specialty, e.g. Neurology" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-600"><Plus className="h-4 w-4" /> Add specialty</button>
      </form>
      <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700"><Save className="h-3.5 w-3.5" /> Updates save automatically.</p>
    </section>
  );
}

function HospitalAdminContent() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Hospital administration</p></div></div>
        <ProfileMenu />
      </header>
      <div className="px-4 py-7 sm:px-6">
        <div className="mx-auto mb-6 max-w-6xl"><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-700"><ShieldCheck className="h-4 w-4" /> Hospital admin</p><h1 className="text-2xl font-bold">Facility operations</h1><p className="mt-1 text-sm text-slate-500">Update bed availability, review incoming emergency requests, and manage specialty staffing.</p></div>
        <BedCapacityCard />
        <HospitalStaffView />
        <SpecialtyManagement />
      </div>
    </main>
  );
}

export default function HospitalAdminPage() {
  const [mounted, setMounted] = useState(false);
  // The provider reads localStorage, so mount it after client hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="min-h-screen bg-slate-50" aria-label="Loading hospital dashboard" />;
  return <CareLinkProvider><HospitalAdminContent /></CareLinkProvider>;
}
