import React, { useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { HospitalBeds } from '../../types';
import { HospitalRequestInbox } from './HospitalRequestInbox';
import { Minus, Plus, Stethoscope } from '../icons';

export const HospitalStaffView: React.FC = () => {
  const { hospitals, updateBedCounts, updateHospitalSpecialty } = useCareLink();
  const [capacityMessage, setCapacityMessage] = useState('');
  const currentHospital = hospitals[0];

  if (!currentHospital) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No hospital records are available.</div>;
  }

  const bedConfigs: { key: keyof HospitalBeds; label: string; color: string }[] = [
    { key: 'general', label: 'General Beds', color: 'text-sky-700 bg-sky-50 border-sky-200' },
    { key: 'icu', label: 'ICU Beds', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { key: 'trauma', label: 'Trauma Beds', color: 'text-rose-700 bg-rose-50 border-rose-200' },
    { key: 'ventilators', label: 'Ventilators', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  ];

  const adjustBedCount = async (bedType: keyof HospitalBeds, delta: number) => {
    try {
      await updateBedCounts(currentHospital.id, bedType, delta);
      setCapacityMessage('');
    } catch {
      setCapacityMessage('Bed availability could not be updated. Refresh the page and try again.');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-md shadow-emerald-200">H</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{currentHospital.name}</h1>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Staff Triage Portal</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{currentHospital.location.address} • Hotline: {currentHospital.phone}</p>
          </div>
        </div>
      </header>

      <HospitalRequestInbox />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Current Bed Availability</h2>
            <p className="text-xs text-slate-500">Update capacity shown to dispatchers and patients.</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">Auto-Sync Live</span>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {bedConfigs.map(({ key, label, color }) => {
            const bed = currentHospital.beds[key];
            const isLow = bed.available <= 1;
            return (
              <div key={key} className={`flex flex-col justify-between rounded-2xl border p-4 transition-all ${color}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
                  {isLow && <span className="animate-pulse rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">CRITICAL</span>}
                </div>
                <div className="my-3 flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-extrabold tracking-tight">{bed.available}</span>
                  <span className="text-base font-medium opacity-60">/{bed.total}</span>
                </div>
                <div className="flex items-center justify-center gap-2 border-t border-black/5 pt-2">
                  <button onClick={() => void adjustBedCount(key, -1)} disabled={bed.available <= 0} title={`Admit patient / decrement ${label}`} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 font-bold text-slate-800 shadow-2xs transition-all hover:bg-white active:scale-95 disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button>
                  <span className="text-[11px] font-semibold opacity-70">Adjust</span>
                  <button onClick={() => void adjustBedCount(key, 1)} disabled={bed.available >= bed.total} title={`Discharge patient / increment ${label}`} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 font-bold text-slate-800 shadow-2xs transition-all hover:bg-white active:scale-95 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
        {capacityMessage && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{capacityMessage}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4"><h2 className="text-base font-bold text-slate-900">Doctor Availability</h2><p className="text-xs text-slate-500">Acceptance checks and reserves one doctor in the required specialty.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {currentHospital.specialties.map((specialty) => {
            const doctors = currentHospital.specialtyDoctors?.[specialty] ?? 0;
            return <div key={specialty} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Stethoscope className="h-4 w-4 text-sky-700" />{specialty}</span>
              <div className="flex items-center gap-2"><button type="button" aria-label={`Remove one ${specialty} doctor`} onClick={() => updateHospitalSpecialty(currentHospital.id, specialty, Math.max(0, doctors - 1))} disabled={doctors <= 0} className="rounded-md bg-white p-1.5 text-slate-700 shadow-2xs disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button><span className="min-w-6 text-center text-sm font-bold text-slate-900">{doctors}</span><button type="button" aria-label={`Add one ${specialty} doctor`} onClick={() => updateHospitalSpecialty(currentHospital.id, specialty, doctors + 1)} className="rounded-md bg-white p-1.5 text-slate-700 shadow-2xs"><Plus className="h-3.5 w-3.5" /></button></div>
            </div>;
          })}
        </div>
      </section>
    </div>
  );
};
