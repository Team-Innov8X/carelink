'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Heart, Plus, Save, ShieldCheck, BedDouble, Stethoscope } from 'lucide-react';
import { CareLinkProvider, useCareLink } from '../../context/CareLinkContext';
import { HospitalStaffView } from '../../components/hospitalStaff/HospitalStaffView';
import { ProfileMenu } from '../../components/common/ProfileMenu';
import { HospitalBeds } from '../../types';

const tileColors = ['text-sky-700 bg-sky-50 border-sky-200', 'text-amber-700 bg-amber-50 border-amber-200', 'text-rose-700 bg-rose-50 border-rose-200', 'text-purple-700 bg-purple-50 border-purple-200'];

function BedCapacityCard() {
  const { hospitals, setBedAvailability } = useCareLink();
  const hospital = hospitals[0];
  if (!hospital) return null;
  const types: { key: keyof HospitalBeds; label: string }[] = [
    { key: 'general', label: 'General beds' }, { key: 'icu', label: 'ICU beds' },
    { key: 'trauma', label: 'Trauma beds' }, { key: 'ventilators', label: 'Ventilation beds' },
  ];
  return <section className="mx-auto mb-6 max-w-6xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xs">
    <div className="mb-5 flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-sky-100 p-2.5 text-sky-700"><BedDouble className="h-5 w-5" /></span><div><h2 className="font-bold">Bed capacity</h2><p className="text-xs text-slate-500">Adjust total beds and currently available capacity.</p></div></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Auto-sync live</span></div>
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{types.map(({ key, label }, index) => {
      const bed = hospital.beds[key];
      return <div key={key} className={`flex flex-col justify-between rounded-2xl border p-4 transition-all ${tileColors[index]}`}>
        <div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider">{label}</span><span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold">{bed.available} available</span></div>
        <div className="mb-3 flex items-baseline justify-center gap-1"><span className="text-4xl font-extrabold tracking-tight">{bed.available}</span><span className="text-sm font-medium opacity-60">/{bed.total}</span></div>
        <label className="text-xs font-medium text-slate-600">Total capacity<input type="number" min={bed.available} value={bed.total} onChange={(event) => setBedAvailability(hospital.id, key, bed.available, Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500" /></label>
      </div>;
    })}</div>
  </section>;
}

function SpecialtyManagement() {
  const { hospitals, updateHospitalSpecialty } = useCareLink();
  const hospital = hospitals[0];
  const [specialtyName, setSpecialtyName] = useState('');
  const [doctorDrafts, setDoctorDrafts] = useState<Record<string, string>>({});

  if (!hospital) return null;

  const addSpecialty = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!specialtyName.trim()) return;
    updateHospitalSpecialty(hospital.id, specialtyName, 0);
    setSpecialtyName('');
  };

  return (
    <section className="mx-auto mt-6 max-w-6xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><Stethoscope className="h-5 w-5" /></span>
          <div><h2 className="text-base font-bold text-slate-900">Doctors by specialty</h2>
          <p className="mt-1 text-xs text-slate-500">Set available doctor counts for {hospital.name}, or add a specialty that is not listed.</p></div>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Auto-sync live</span>
      </div>
      <div className="space-y-3">
        {hospital.specialties.map((specialty, index) => (
          <label key={specialty} className={`flex items-center justify-between gap-4 rounded-2xl border p-4 text-sm font-medium transition-all ${tileColors[index % tileColors.length]}`}>
            <span>{specialty}</span>
            <span className="flex items-center gap-2 text-xs font-medium text-slate-500">Doctors available
              <input aria-label={`${specialty} doctors available`} type="number" min="0" value={doctorDrafts[specialty] ?? String(hospital.specialtyDoctors?.[specialty] ?? 0)} onChange={(event) => setDoctorDrafts((drafts) => ({ ...drafts, [specialty]: event.target.value }))} onBlur={() => { const value = Number(doctorDrafts[specialty]); if (doctorDrafts[specialty] !== undefined && Number.isFinite(value)) void updateHospitalSpecialty(hospital.id, specialty, value); setDoctorDrafts((drafts) => { const next = { ...drafts }; delete next[specialty]; return next; }); }} className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm text-slate-900" />
            </span>
          </label>
        ))}
      </div>
      <form onSubmit={addSpecialty} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input value={specialtyName} onChange={(event) => setSpecialtyName(event.target.value)} placeholder="New specialty, e.g. Neurology" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 hover:bg-violet-600"><Plus className="h-4 w-4" /> Add specialty</button>
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
