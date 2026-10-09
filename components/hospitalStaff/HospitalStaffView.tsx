'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { HospitalBeds } from '../../types';
import { HospitalRequestInbox } from './HospitalRequestInbox';
import { Minus, Plus, Stethoscope, UserCheck, Trash2, Edit2, AlertCircle } from 'lucide-react';

type DoctorItem = {
  id: string;
  _id?: string;
  name: string;
  qualification: string;
  specialization: string;
  availability: 'available' | 'on_call' | 'off_duty';
  phone?: string;
  experienceYears?: number;
  updatedAt?: string;
};

export const HospitalStaffView: React.FC = () => {
  const { hospitals, updateBedCounts, updateHospitalSpecialty } = useCareLink();
  const [capacityMessage, setCapacityMessage] = useState('');
  const currentHospital = hospitals[0];

  // Doctors Management State
  const [doctors, setDoctors] = useState<DoctorItem[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [doctorMessage, setDoctorMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    qualification: '',
    specialization: '',
    availability: 'available' as 'available' | 'on_call' | 'off_duty',
    phone: '',
    experienceYears: '',
  });
  const [submittingDoctor, setSubmittingDoctor] = useState(false);

  const fetchDoctors = useCallback(async () => {
    if (!currentHospital?.id) return;
    setLoadingDoctors(true);
    try {
      const res = await fetch(`/api/hospitals/${encodeURIComponent(currentHospital.id)}/doctors`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load doctors');
      }
      const data = await res.json();
      setDoctors(data.doctors || []);
    } catch (err) {
      setDoctorMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not load doctors',
      });
    } finally {
      setLoadingDoctors(false);
    }
  }, [currentHospital?.id]);

  useEffect(() => {
    void fetchDoctors();
  }, [fetchDoctors]);

  const handleEditClick = (doc: DoctorItem) => {
    setEditingDoctorId(doc.id || doc._id || '');
    setFormData({
      name: doc.name,
      qualification: doc.qualification,
      specialization: doc.specialization,
      availability: doc.availability,
      phone: doc.phone || '',
      experienceYears: doc.experienceYears !== undefined ? String(doc.experienceYears) : '',
    });
    setDoctorMessage(null);
  };

  const handleCancelForm = () => {
    setEditingDoctorId(null);
    setFormData({
      name: '',
      qualification: '',
      specialization: '',
      availability: 'available',
      phone: '',
      experienceYears: '',
    });
  };

  const handleSubmitDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHospital?.id || submittingDoctor) return;
    setSubmittingDoctor(true);
    setDoctorMessage(null);

    const body: Record<string, unknown> = {
      name: formData.name.trim(),
      qualification: formData.qualification.trim(),
      specialization: formData.specialization.trim(),
      availability: formData.availability,
      phone: formData.phone.trim() || undefined,
      experienceYears: formData.experienceYears ? Number(formData.experienceYears) : undefined,
    };

    try {
      if (editingDoctorId) {
        // PATCH
        const res = await fetch(
          `/api/hospitals/${encodeURIComponent(currentHospital.id)}/doctors/${encodeURIComponent(editingDoctorId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update doctor');
        setDoctorMessage({ type: 'success', text: `Doctor ${body.name} updated successfully.` });
      } else {
        // POST
        const res = await fetch(`/api/hospitals/${encodeURIComponent(currentHospital.id)}/doctors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add doctor');
        setDoctorMessage({ type: 'success', text: `Doctor ${body.name} added to roster.` });
      }

      handleCancelForm();
      await fetchDoctors();
    } catch (err) {
      setDoctorMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Operation failed',
      });
    } finally {
      setSubmittingDoctor(false);
    }
  };

  const handleDeleteDoctor = async (docId: string, name: string) => {
    if (!currentHospital?.id || !window.confirm(`Are you sure you want to remove Dr. ${name}?`)) return;
    try {
      const res = await fetch(
        `/api/hospitals/${encodeURIComponent(currentHospital.id)}/doctors/${encodeURIComponent(docId)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove doctor');
      setDoctorMessage({ type: 'success', text: `Doctor ${name} removed.` });
      await fetchDoctors();
    } catch (err) {
      setDoctorMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not remove doctor',
      });
    }
  };

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
    const saved = await updateBedCounts(currentHospital.id, bedType, delta);
    setCapacityMessage(saved ? '' : 'Bed availability changed or could not be saved. Refresh the page and try again.');
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

      {/* Bed Availability Section */}
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

      {/* Specialty Doctor Counts Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4"><h2 className="text-base font-bold text-slate-900">Doctor Counts by Specialty</h2><p className="text-xs text-slate-500">Quick capacity adjustments for emergency matching algorithms.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {currentHospital.specialties.map((specialty) => {
            const docCount = currentHospital.specialtyDoctors?.[specialty] ?? 0;
            return <div key={specialty} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Stethoscope className="h-4 w-4 text-sky-700" />{specialty}</span>
              <div className="flex items-center gap-2"><button type="button" aria-label={`Remove one ${specialty} doctor`} onClick={() => updateHospitalSpecialty(currentHospital.id, specialty, Math.max(0, docCount - 1))} disabled={docCount <= 0} className="rounded-md bg-white p-1.5 text-slate-700 shadow-2xs disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button><span className="min-w-6 text-center text-sm font-bold text-slate-900">{docCount}</span><button type="button" aria-label={`Add one ${specialty} doctor`} onClick={() => updateHospitalSpecialty(currentHospital.id, specialty, docCount + 1)} className="rounded-md bg-white p-1.5 text-slate-700 shadow-2xs"><Plus className="h-3.5 w-3.5" /></button></div>
            </div>;
          })}
        </div>
      </section>

      {/* Task 3: Doctor Roster Management (Add, Edit, Remove) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-sky-700" />
              <span>Hospital Doctors & Medical Staff</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage doctor qualifications, specializations, and real-time duty status.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {doctors.length} {doctors.length === 1 ? 'doctor' : 'doctors'} on roster
          </span>
        </div>

        {doctorMessage && (
          <div
            role="status"
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              doctorMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{doctorMessage.text}</span>
          </div>
        )}

        {/* Doctor List */}
        {loadingDoctors ? (
          <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">Loading doctor roster…</p>
        ) : doctors.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">
            No doctor information added by this hospital yet. Add your first medical specialist below.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Doctor Name</th>
                  <th className="px-4 py-3">Qualification</th>
                  <th className="px-4 py-3">Specialization</th>
                  <th className="px-4 py-3">Availability</th>
                  <th className="px-4 py-3">Phone / Exp</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctors.map((doc) => {
                  const docId = doc.id || doc._id || '';
                  const availLabel =
                    doc.availability === 'available'
                      ? 'Available'
                      : doc.availability === 'on_call'
                      ? 'On Call'
                      : 'Off Duty';

                  const badgeStyle =
                    doc.availability === 'available'
                      ? 'bg-emerald-100 text-emerald-800'
                      : doc.availability === 'on_call'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600';

                  return (
                    <tr key={docId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900">{doc.name}</td>
                      <td className="px-4 py-3 text-slate-600">{doc.qualification}</td>
                      <td className="px-4 py-3 text-slate-600">{doc.specialization}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeStyle}`}>
                          {availLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {doc.phone && <div>{doc.phone}</div>}
                        {doc.experienceYears !== undefined && (
                          <div className="text-[10px] text-slate-400">{doc.experienceYears} yrs experience</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditClick(doc)}
                            className="p-1 text-slate-500 hover:text-sky-700 rounded hover:bg-slate-100 transition"
                            title="Edit doctor"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDoctor(docId, doc.name)}
                            className="p-1 text-slate-500 hover:text-rose-600 rounded hover:bg-slate-100 transition"
                            title="Remove doctor"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add / Edit Doctor Form */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <h3 className="font-bold text-sm text-slate-900 mb-3">
            {editingDoctorId ? 'Edit Doctor Information' : 'Add New Doctor to Hospital Roster'}
          </h3>
          <form onSubmit={handleSubmitDoctor} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Doctor Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Dr. Rajesh Kumar"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Qualification *
              </label>
              <input
                type="text"
                required
                value={formData.qualification}
                onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                placeholder="MBBS, MD Cardiology"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Specialization *
              </label>
              <input
                type="text"
                required
                value={formData.specialization}
                onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                placeholder="Cardiology / Trauma / Pediatrics"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Availability *
              </label>
              <select
                value={formData.availability}
                onChange={(e) => setFormData({ ...formData, availability: e.target.value as 'available' | 'on_call' | 'off_duty' })}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value="available">Available</option>
                <option value="on_call">On Call</option>
                <option value="off_duty">Off Duty</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Phone (optional)
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Experience in Years (optional)
              </label>
              <input
                type="number"
                min="0"
                value={formData.experienceYears}
                onChange={(e) => setFormData({ ...formData, experienceYears: e.target.value })}
                placeholder="10"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-3 flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={submittingDoctor}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-sky-700 hover:bg-sky-800 transition disabled:opacity-50"
              >
                {submittingDoctor ? 'Saving…' : editingDoctorId ? 'Save Doctor Changes' : 'Add Doctor'}
              </button>
              {editingDoctorId && (
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
};
