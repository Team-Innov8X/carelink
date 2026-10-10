'use client';

import { useEffect, useState } from 'react';

type Doctor = { id: string; name: string; qualification: string; specialization: string; availability: 'available' | 'on_call' | 'off_duty'; phone?: string; experienceYears?: number };
const empty = { name: '', qualification: '', specialization: '', availability: 'available', phone: '', experienceYears: '' };

export function ClinicalDoctorsManager() {
  const [hospitalId, setHospitalId] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { void fetch('/api/hospital-admin/clinical-doctors').then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setHospitalId(data.hospitalId); setDoctors(data.doctors); }).catch((e: unknown) => setMessage(e instanceof Error ? e.message : 'Could not load doctor roster.')); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    const body: Omit<Doctor, 'id'> = { ...draft, availability: draft.availability as Doctor['availability'], phone: draft.phone || undefined, experienceYears: draft.experienceYears ? Number(draft.experienceYears) : undefined };
    const response = await fetch(editing ? `/api/hospitals/${hospitalId}/doctors/${editing}` : `/api/hospitals/${hospitalId}/doctors`, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || 'Could not save doctor.'); return; }
    if (editing) setDoctors((current) => current.map((doctor) => doctor.id === editing ? { ...doctor, ...body } : doctor));
    else setDoctors((current) => [...current, { ...data, id: data.id }]);
    setDraft(empty); setEditing(null); setMessage(editing ? 'Doctor updated.' : 'Doctor added.');
  };
  const remove = async (doctor: Doctor) => {
    const response = await fetch(`/api/hospitals/${hospitalId}/doctors/${doctor.id}`, { method: 'DELETE' });
    const data = await response.json(); if (!response.ok) { setMessage(data.error || 'Could not remove doctor.'); return; }
    setDoctors((current) => current.filter((item) => item.id !== doctor.id));
  };
  const startEdit = (doctor: Doctor) => { setEditing(doctor.id); setDraft({ ...empty, ...doctor, experienceYears: doctor.experienceYears?.toString() ?? '' }); };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Clinical doctor directory</h2><p className="mt-1 text-sm text-slate-600">Manage the qualifications and availability patients see.</p>{message && <p role="status" className="mt-3 rounded-lg bg-sky-50 p-3 text-sm">{message}</p>}
    <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(['name','qualification','specialization','phone','experienceYears'] as const).map((key) => <label key={key} className="text-xs font-semibold capitalize text-slate-700">{key === 'experienceYears' ? 'Experience (years)' : key}<input required={key !== 'phone' && key !== 'experienceYears'} type={key === 'experienceYears' ? 'number' : 'text'} min={key === 'experienceYears' ? 0 : undefined} value={draft[key]} onChange={(e) => setDraft((value) => ({ ...value, [key]: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>)}<label className="text-xs font-semibold text-slate-700">Availability<select value={draft.availability} onChange={(e) => setDraft((value) => ({ ...value, availability: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="available">Available</option><option value="on_call">On call</option><option value="off_duty">Off duty</option></select></label><button className="self-end rounded-lg bg-sky-800 px-4 py-2 text-sm font-bold text-white">{editing ? 'Save changes' : 'Add doctor'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setDraft(empty); }} className="self-end rounded-lg border px-4 py-2 text-sm">Stop editing</button>}</form>
    <ul className="mt-5 divide-y divide-slate-100">{doctors.map((doctor) => <li key={doctor.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{doctor.name} · {doctor.specialization}</p><p className="text-sm text-slate-600">{doctor.qualification} · {doctor.availability.replace('_', ' ')}{doctor.experienceYears !== undefined ? ` · ${doctor.experienceYears} years` : ''}{doctor.phone ? ` · ${doctor.phone}` : ''}</p></div><div className="flex gap-2"><button type="button" onClick={() => startEdit(doctor)} className="rounded border px-3 py-1.5 text-sm">Edit</button><button type="button" onClick={() => void remove(doctor)} className="rounded border border-rose-200 px-3 py-1.5 text-sm text-rose-800">Delete</button></div></li>)}</ul>
    {!doctors.length && <p className="mt-4 text-sm text-slate-600">No doctor information added by this hospital yet.</p>}</section>;
}
