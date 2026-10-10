'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, ShieldCheck } from '@/components/icons';
import { ProfileMenu } from '../../components/common/ProfileMenu';
import { HospitalRequestInbox } from '../../components/hospitalStaff/HospitalRequestInbox';
import { SearchField } from '../../components/common/SearchField';
import { hospitalSpecialties } from '../../data/hospitalSpecialties';
import { readApiJson } from '@/lib/client-api';
import { dischargeHospitalAdminDemoCase, getHospitalAdminDemoAdmissions, getHospitalAdminDemoActivity } from '@/lib/hospital-admin-demo';
import { SettingsView } from '@/components/settings/SettingsView';

const tileColors = ['text-slate-800 bg-slate-50 border-slate-200', 'text-slate-800 bg-slate-50 border-slate-200', 'text-slate-800 bg-slate-50 border-slate-200', 'text-slate-800 bg-slate-50 border-slate-200'];
type BedType = 'general' | 'icu' | 'trauma' | 'ventilators';
type HospitalDoctor = { id: string; name: string; specialty: string; available: boolean; addedAt?: string; shiftStart?: string; shiftEnd?: string; onCall?: boolean };
type AdminHospital = { id: string; name: string; beds: Record<BedType, { total: number; available: number; reserved?: number; occupied?: number; lastUpdatedAt?: string }>; specialties?: string[]; doctors?: HospitalDoctor[]; acceptingRequests?: boolean; lastCapacityUpdatedAt?: string; capacitySource?: string };
type Admission = { _id: string; hospitalRequestId: string; patientId: string; patientName: string; patientPhone?: string; incidentType: string; bedCategory?: BedType; admittedAt: string; isDemo?: boolean };
const demoHospital: AdminHospital = { id: 'demo-hospital', name: 'City Care Hospital', beds: { general: { total: 20, available: 12 }, icu: { total: 8, available: 4 }, trauma: { total: 4, available: 2 }, ventilators: { total: 8, available: 6 } }, specialties: ['Trauma Care', 'Cardiac', 'ICU'] };
const demoDoctors: HospitalDoctor[] = [
  { id: 'demo-doctor-1', name: 'Dr. Asha Mehta', specialty: 'Cardiac', available: true },
  { id: 'demo-doctor-2', name: 'Dr. Kabir Rao', specialty: 'Trauma Care', available: true },
  { id: 'demo-doctor-3', name: 'Dr. Nisha Shah', specialty: 'ICU', available: false },
];

function PatientsAdmitted({ searchQuery }: { searchQuery: string }) {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = searchQuery.trim().toLocaleLowerCase();
  const visibleAdmissions = admissions.filter((patient) => `${patient.patientName} ${patient.patientId} ${patient.patientPhone || ''} ${patient.incidentType} ${patient.bedCategory || ''}`.toLocaleLowerCase().includes(query));
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/hospital-admin/admissions', { cache: 'no-store' });
        const result = await readApiJson<{ admissions?: Admission[]; error?: string }>(response, 'Could not load admissions.');
        if (!response.ok) throw new Error(result.error || 'Could not load admissions.');
        if (!cancelled) { setAdmissions([...getHospitalAdminDemoAdmissions(), ...(result.admissions ?? [])]); setMessage(''); }
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not load admissions.'); }
      finally { if (!cancelled) setLoading(false); }
    };
    const onDemoUpdated = () => void refresh();
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 10000);
    window.addEventListener('hospital-admin-demo-updated', onDemoUpdated);
    return () => { cancelled = true; window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('hospital-admin-demo-updated', onDemoUpdated); };
  }, []);
  const discharge = async (admissionId: string) => {
    if (!window.confirm('Discharge this patient and return the bed to available inventory?')) return;
    setBusyId(admissionId); setMessage('');
    if (admissionId.startsWith('demo-case-')) {
      dischargeHospitalAdminDemoCase(admissionId);
      setAdmissions((current) => current.filter((item) => item._id !== admissionId));
      setMessage('Demo patient discharged. The demo bed is available again.');
      setBusyId(null);
      return;
    }
    try {
      const response = await fetch('/api/hospital-admin/admissions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admissionId }) });
      const result = await readApiJson<{ error?: string }>(response, 'Could not discharge patient.');
      if (!response.ok) throw new Error(result.error || 'Could not discharge patient.');
      setAdmissions((current) => current.filter((item) => item._id !== admissionId));
      setMessage('Patient discharged. The bed is back in available inventory.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not discharge patient.'); }
    finally { setBusyId(null); }
  };
  return <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-bold text-slate-900">Patients admitted</h2><p className="mt-1 text-sm text-slate-500">Patients with an admission recorded for this hospital.</p></div><p className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800">Total currently admitted <span className="ml-1 text-lg">{admissions.length}</span></p></div>
    {message && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</p>}
    {loading ? <p className="mt-4 text-sm text-slate-500">Loading patient admissions…</p> : admissions.length ? visibleAdmissions.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Patient</th><th className="px-3 py-2">Patient ID</th><th className="px-3 py-2">Unit / attending</th><th className="px-3 py-2">Case</th><th className="px-3 py-2">Bed type</th><th className="px-3 py-2">Admitted</th><th className="px-3 py-2">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleAdmissions.map((patient) => <tr key={patient._id} className="align-top"><td className="px-3 py-3 font-semibold text-slate-900"><button type="button" onClick={() => setSelected((current) => current === patient._id ? null : patient._id)} className="text-left hover:text-sky-800">{patient.patientName}</button>{selected === patient._id && <p className="mt-1 text-xs font-normal text-slate-600">Request ref {patient.hospitalRequestId.slice(0, 8)}</p>}</td><td className="px-3 py-3 text-xs text-slate-600">{patient.patientId}</td><td className="px-3 py-3 text-xs text-slate-600">{patient.bedCategory ? `${patient.bedCategory.toUpperCase()} unit` : 'Unit pending'}<p className="mt-1">Attending not assigned</p></td><td className="px-3 py-3 text-slate-600">{patient.incidentType}</td><td className="px-3 py-3 text-slate-600">{patient.bedCategory?.toUpperCase() || 'Not specified'}</td><td className="px-3 py-3 text-xs text-slate-600">{new Date(patient.admittedAt).toLocaleString()}</td><td className="px-3 py-3"><button type="button" disabled={busyId === patient._id} onClick={() => void discharge(patient._id)} className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busyId === patient._id ? 'Saving…' : 'Discharge'}</button></td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No admitted patients match this search.</p> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No patients have been recorded as admitted yet. Use “Mark patient admitted” on an accepted incoming request after arrival.</p>}
  </section>;
}

function BedCapacityCard({ hospitalName, searchQuery }: { hospitalName: string; searchQuery: string }) {
  const [hospital, setHospital] = useState<AdminHospital | null>(null);
  const [hasAddress, setHasAddress] = useState(true);
  const [drafts, setDrafts] = useState<Record<BedType, { total: number; available: number }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyBed, setBusyBed] = useState<BedType | null>(null);
  const [message, setMessage] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [clockNow, setClockNow] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/hospital-admin', { cache: 'no-store' }).then(async (response) => {
      const result = await response.json();
      if (response.status === 404) { if (!cancelled) { setHospital({ ...demoHospital, name: hospitalName || demoHospital.name }); setDrafts(demoHospital.beds); setDemoMode(true); } return; }
      if (!response.ok) throw new Error(result.error || 'Could not load bed availability.');
      if (!cancelled) { setHospital(result.hospital); setDrafts(result.hospital.beds); setHasAddress(result.hasAddress !== false); }
    }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not load bed availability.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hospitalName]);
  useEffect(() => { const timer = window.setTimeout(() => setClockNow(Date.now()), 0); const interval = window.setInterval(() => setClockNow(Date.now()), 60_000); return () => { window.clearTimeout(timer); window.clearInterval(interval); }; }, []);
  const types: { key: BedType; label: string }[] = [
    { key: 'general', label: 'General beds' }, { key: 'icu', label: 'ICU beds' },
    { key: 'trauma', label: 'Trauma beds' }, { key: 'ventilators', label: 'Ventilation beds' },
  ];
  const query = searchQuery.trim().toLocaleLowerCase();
  const visibleTypes = types.filter((item) => `${item.label} ${item.key}`.toLocaleLowerCase().includes(query));
  const save = async (bedType: BedType) => {
    if (!drafts || !hospital) return;
    if (demoMode) { setHospital((current) => current ? { ...current, beds: { ...current.beds, [bedType]: drafts[bedType] } } : current); setMessage('Demo capacity updated in this view only. Link a hospital record to save real inventory.'); return; }
    setBusyBed(bedType); setMessage('');
    try {
      const response = await fetch('/api/hospital-admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bedType, ...drafts[bedType] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save bed availability.');
      const updatedAt = new Date().toISOString();
      setHospital((current) => current ? { ...current, lastCapacityUpdatedAt: updatedAt, capacitySource: 'staff-confirmed', beds: { ...current.beds, [bedType]: { ...result.bed, lastUpdatedAt: updatedAt } } } : current);
      setMessage(`${types.find((item) => item.key === bedType)?.label} updated.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save bed availability.'); }
    finally { setBusyBed(null); }
  };
  const adjustAvailable = async (bedType: BedType, delta: number) => {
    if (!hospital || !drafts) return;
    const current = hospital.beds[bedType];
    const available = Math.max(0, Math.min(current.total, current.available + delta));
    if (available === current.available) return;
    if (demoMode) {
      const bed = { ...current, available };
      setHospital((value) => value ? { ...value, beds: { ...value.beds, [bedType]: bed } } : value);
      setDrafts((value) => value ? { ...value, [bedType]: bed } : value);
      setMessage('Demo availability adjusted locally. No live hospital inventory was changed.');
      return;
    }
    setBusyBed(bedType); setMessage('');
    try {
      const response = await fetch('/api/hospital-admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bedType, total: current.total, available }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not adjust bed availability.');
      const updatedAt = new Date().toISOString();
      setHospital((value) => value ? { ...value, lastCapacityUpdatedAt: updatedAt, capacitySource: 'staff-confirmed', beds: { ...value.beds, [bedType]: { ...result.bed, lastUpdatedAt: updatedAt } } } : value);
      setDrafts((value) => value ? { ...value, [bedType]: result.bed } : value);
      setMessage(`${types.find((item) => item.key === bedType)?.label} availability updated.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not adjust bed availability.'); }
    finally { setBusyBed(null); }
  };
  const hospitalAction = async (action: 'accepting' | 'reconfirm' | 'simulate-stale', acceptingRequests?: boolean) => {
    if (demoMode) {
      setHospital((current) => current ? { ...current, acceptingRequests: action === 'accepting' ? acceptingRequests : current.acceptingRequests, lastCapacityUpdatedAt: action === 'simulate-stale' ? new Date(Date.now() - 60 * 60_000).toISOString() : new Date().toISOString(), capacitySource: action === 'simulate-stale' ? 'auto-simulated' : 'staff-confirmed' } : current);
      return;
    }
    const response = await fetch('/api/hospital-admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, acceptingRequests }) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || 'Could not update hospital status.'); return; }
    setHospital((current) => current ? { ...current, acceptingRequests: result.acceptingRequests, lastCapacityUpdatedAt: result.lastCapacityUpdatedAt, capacitySource: result.capacitySource } : current);
  };
  if (loading) return <section className="rounded-xl bg-white p-6 text-sm text-slate-500">Loading bed availability…</section>;
  if (!hospital || !drafts) return <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="font-bold">Bed management is not linked yet</h2><p className="mt-1">{message || `No bed record matches “${hospitalName || 'this account'}”. Link this account to its hospital record before editing availability, capacity, or specialties. No hospital data has been changed.`}</p></section>;
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xs sm:p-5">
    {!hasAddress && !demoMode && <p role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">Add your address so patients can find you.</p>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Current bed availability</h2><p className="mt-1 text-xs text-slate-500">Live inventory split into available, reserved, and occupied beds.</p></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${hospital.lastCapacityUpdatedAt && clockNow - new Date(hospital.lastCapacityUpdatedAt).getTime() < 10 * 60_000 ? 'bg-emerald-50 text-emerald-700' : hospital.lastCapacityUpdatedAt && clockNow - new Date(hospital.lastCapacityUpdatedAt).getTime() < 30 * 60_000 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{hospital.lastCapacityUpdatedAt ? `Updated ${Math.max(0, Math.floor((clockNow - new Date(hospital.lastCapacityUpdatedAt).getTime()) / 60000))} min ago` : 'Unconfirmed'}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{hospital.capacitySource || (demoMode ? 'Demo values' : 'Unconfirmed')}</span><button type="button" onClick={() => void hospitalAction('reconfirm')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold">Re-confirm</button><button type="button" onClick={() => void hospitalAction('accepting', hospital.acceptingRequests === false)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${hospital.acceptingRequests === false ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{hospital.acceptingRequests === false ? 'Diverted · Resume' : 'Accepting · Divert'}</button><span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold text-slate-600">{demoMode ? 'DEMO · local only' : 'Live sync'}</span></div></div>
    {message && <p role="status" className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{message}</p>}
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{types.map(({ key, label }, index) => { const bed = hospital.beds[key]; const occupied = bed.occupied ?? Math.max(0, bed.total - bed.available - (bed.reserved ?? 0)); const reserved = bed.reserved ?? 0; const percent = bed.total ? Math.round(((occupied + reserved) / bed.total) * 100) : 0; const bedUpdated = bed.lastUpdatedAt || hospital.lastCapacityUpdatedAt; const minutesOld = bedUpdated && clockNow ? Math.max(0, Math.floor((clockNow - new Date(bedUpdated).getTime()) / 60000)) : null; return <article key={key} className={`rounded-xl border p-3.5 ${tileColors[index]}`}><p className="text-xs font-bold uppercase tracking-wide">{key === 'general' ? 'General / OPD beds' : label}</p><p className={`mt-1 text-[10px] font-semibold ${minutesOld === null ? 'text-rose-700' : minutesOld < 10 ? 'text-emerald-700' : minutesOld < 30 ? 'text-amber-700' : 'text-rose-700'}`}>{minutesOld === null ? 'Unconfirmed' : `Updated ${minutesOld} min ago`}</p><div className="mt-2 flex items-baseline justify-center gap-1"><strong className="text-4xl font-extrabold">{bed.available}</strong><span className="text-sm font-medium opacity-60">available / {bed.total}</span></div><p className="mt-1.5 text-center text-xs text-slate-600">{reserved} reserved · {occupied} occupied</p><div className="my-2.5 flex items-center justify-center gap-2"><button type="button" aria-label={`Reduce available ${label}`} disabled={busyBed === key || bed.available <= 0} onClick={() => void adjustAvailable(key, -1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-lg leading-none text-slate-700 disabled:opacity-40">−</button><span className="text-xs font-semibold">Adjust</span><button type="button" aria-label={`Increase available ${label}`} disabled={busyBed === key || bed.available >= bed.total - reserved - occupied} onClick={() => void adjustAvailable(key, 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-lg leading-none text-slate-700 disabled:opacity-40">+</button></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-slate-500" style={{ width: `${percent}%` }} /></div><p className="mt-1 text-right text-[11px]">Occupied + reserved · {percent}%</p></article>; })}</div>
    <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-bold">Bed capacity</h3><p className="mt-1 text-xs text-slate-500">Capacity editing is separate from live availability.</p></div><button type="button" onClick={() => setEditingCapacity((current) => !current)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">{editingCapacity ? 'Close editor' : 'Edit capacity'}</button></div>
    {editingCapacity && (visibleTypes.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{visibleTypes.map(({ key, label }) => {
      const index = types.findIndex((item) => item.key === key);
      const bed = hospital.beds[key];
      const draft = drafts[key];
      return <div key={key} className={`flex flex-col justify-between rounded-2xl border p-4 transition-all ${tileColors[index]}`}>
        <div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider">{label}</span><span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold">{bed.available} available</span></div>
        <div className="mb-3 flex items-baseline justify-center gap-1"><span className="text-4xl font-extrabold tracking-tight">{bed.available}</span><span className="text-sm font-medium opacity-60">/{bed.total}</span></div>
        <label className="text-xs font-medium text-slate-600">Total capacity<input type="number" min={bed.total - bed.available} value={draft.total} onChange={(event) => setDrafts((current) => current ? { ...current, [key]: { ...current[key], total: event.target.value === '' ? 0 : Number(event.target.value) } } : current)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500" /></label>
        <label className="mt-3 block text-xs font-medium text-slate-600">Available beds<input type="number" min="0" max={draft.total} value={draft.available} onChange={(event) => setDrafts((current) => current ? { ...current, [key]: { ...current[key], available: event.target.value === '' ? 0 : Number(event.target.value) } } : current)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500" /></label>
        <p className="mt-2 text-xs text-slate-500">Occupied: {bed.total - bed.available}</p>
        <button type="button" disabled={busyBed === key} onClick={() => void save(key)} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{busyBed === key ? 'Saving…' : 'Save capacity'}</button>
      </div>;
    })}</div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No bed categories match this search.</p>)}
  </section>;
}

function DoctorRoster({ searchQuery }: { searchQuery: string }) {
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('16:00');
  const [dutyStatus, setDutyStatus] = useState<'available' | 'on_call' | 'off_duty'>('available');
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pendingDemand, setPendingDemand] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/hospital-admin', { cache: 'no-store' }).then(async (response) => {
      const result = await readApiJson<{ hospital?: AdminHospital; error?: string }>(response, 'Could not load the doctor roster.');
      if (response.status === 404) { if (!cancelled) { setDoctors(demoDoctors); setSpecialties(demoHospital.specialties ?? []); setDemoMode(true); } return; }
      if (!response.ok) throw new Error(result.error || 'Could not load the doctor roster.');
      if (!result.hospital) throw new Error('The hospital record did not include a doctor roster.');
      if (!cancelled) { setDoctors(result.hospital.doctors ?? []); setSpecialties(result.hospital.specialties ?? []); }
    }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not load the doctor roster.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const refreshDemand = async () => {
      try {
        const response = await fetch('/api/hospital-requests', { cache: 'no-store' });
        const result = await readApiJson<{ requests?: Array<{ status: string; incidentType: string; requiredEquipment: string[] }> }>(response, 'Could not refresh incoming cases.');
        if (!response.ok) throw new Error('Could not refresh incoming cases.');
        const pending = (result.requests ?? []).filter((item) => item.status === 'pending');
        const match = doctors.filter((doctor) => doctor.available).flatMap((doctor) => pending.filter((item) => `${item.incidentType} ${item.requiredEquipment.join(' ')}`.toLocaleLowerCase().includes(doctor.specialty.toLocaleLowerCase())).map((item) => `${item.incidentType}: ${doctor.name} available`))[0];
        if (!cancelled) setPendingDemand(match || (pending.length ? `${pending.length} pending case${pending.length === 1 ? '' : 's'} · check specialty coverage` : ''));
      } catch { if (!cancelled) setPendingDemand(''); }
    };
    void refreshDemand(); const timer = window.setInterval(() => void refreshDemand(), 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [doctors]);
  const visibleDoctors = doctors.filter((doctor) => `${doctor.name} ${doctor.specialty} ${doctor.available ? 'available' : 'unavailable'}`.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()));
  const addDoctor = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const cleanName = name.trim(); const cleanSpecialty = specialty.trim();
    if (!cleanName || !cleanSpecialty) return;
    setBusyId('add'); setMessage('');
    if (demoMode) {
      setDoctors((current) => [...current, { id: `demo-doctor-${Date.now()}`, name: cleanName, specialty: cleanSpecialty, available: dutyStatus !== 'off_duty', shiftStart, shiftEnd, onCall: dutyStatus === 'on_call' }]);
      setSpecialties((current) => current.some((item) => item.toLocaleLowerCase() === cleanSpecialty.toLocaleLowerCase()) ? current : [...current, cleanSpecialty]);
      setName(''); setSpecialty(''); setDutyStatus('available'); setMessage('Demo doctor added locally. No live hospital roster was changed.'); setBusyId(null); return;
    }
    try {
      const response = await fetch('/api/hospital-admin/doctors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cleanName, specialty: cleanSpecialty, available: dutyStatus !== 'off_duty', shiftStart, shiftEnd, onCall: dutyStatus === 'on_call' }) });
      const result = await readApiJson<{ doctor: HospitalDoctor; error?: string }>(response, 'Could not add doctor.');
      if (!response.ok) throw new Error(result.error || 'Could not add doctor.');
      setDoctors((current) => [...current, result.doctor]); setSpecialties((current) => current.some((item) => item.toLocaleLowerCase() === cleanSpecialty.toLocaleLowerCase()) ? current : [...current, cleanSpecialty]);
      setName(''); setSpecialty(''); setDutyStatus('available'); setMessage('Doctor added to the hospital roster.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add doctor.'); }
    finally { setBusyId(null); }
  };
  const toggleAvailability = async (doctor: HospitalDoctor) => {
    const available = !doctor.available; setBusyId(doctor.id); setMessage('');
    if (demoMode) { setDoctors((current) => current.map((item) => item.id === doctor.id ? { ...item, available } : item)); setMessage('Demo doctor availability changed locally.'); setBusyId(null); return; }
    try {
      const response = await fetch('/api/hospital-admin/doctors', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId: doctor.id, available }) });
      const result = await readApiJson<{ error?: string }>(response, 'Could not update doctor availability.'); if (!response.ok) throw new Error(result.error || 'Could not update doctor availability.');
      setDoctors((current) => current.map((item) => item.id === doctor.id ? { ...item, available, onCall: available ? item.onCall : false } : item));
      setMessage(`${doctor.name} is marked ${available ? 'available' : 'unavailable'}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update doctor availability.'); }
    finally { setBusyId(null); }
  };
  const removeDoctor = async (doctor: HospitalDoctor) => {
    setBusyId(doctor.id); setMessage('');
    if (demoMode) { setDoctors((current) => current.filter((item) => item.id !== doctor.id)); setMessage('Demo doctor removed locally.'); setBusyId(null); return; }
    try {
      const response = await fetch('/api/hospital-admin/doctors', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId: doctor.id }) });
      const result = await readApiJson<{ error?: string }>(response, 'Could not remove doctor.'); if (!response.ok) throw new Error(result.error || 'Could not remove doctor.');
      setDoctors((current) => current.filter((item) => item.id !== doctor.id)); setMessage(`${doctor.name} removed from the roster.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not remove doctor.'); }
    finally { setBusyId(null); }
  };
  if (loading) return <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading doctor roster…</section>;
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">Hospital doctor roster</h2><p className="mt-1 text-sm text-slate-500">Manage doctors by name, specialty, and current availability.</p></div>{demoMode && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-800">Demo · local only</span>}</div>
    {message && <p role="status" className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{message}</p>}
    {pendingDemand && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Pending demand: {pendingDemand}</p>}
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-2xl font-extrabold text-emerald-800">{doctors.filter((doctor) => doctor.available).length}</p><p className="text-xs font-semibold text-emerald-800">Available now</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-2xl font-extrabold text-slate-800">{doctors.length}</p><p className="text-xs font-semibold text-slate-600">Doctors on roster</p></div><div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 sm:col-span-1"><p className="text-2xl font-extrabold text-sky-800">{specialties.length || new Set(doctors.map((doctor) => doctor.specialty)).size}</p><p className="text-xs font-semibold text-slate-600">Specialties covered</p></div></div>
    <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Doctor</th><th className="px-4 py-3">Specialty</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Duty status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleDoctors.map((doctor) => <tr key={doctor.id}><td className="px-4 py-3 font-semibold text-slate-900">{doctor.name}</td><td className="px-4 py-3 text-slate-600">{doctor.specialty}</td><td className="px-4 py-3 text-xs text-slate-600">{doctor.shiftStart && doctor.shiftEnd ? `${doctor.shiftStart}–${doctor.shiftEnd}` : 'Shift not set'}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${doctor.onCall ? 'bg-sky-100 text-sky-800' : doctor.available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{doctor.onCall ? 'On call' : doctor.available ? 'Available' : 'Off duty'}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" disabled={busyId !== null} onClick={() => void toggleAvailability(doctor)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">{busyId === doctor.id ? 'Saving…' : doctor.available ? 'Set off duty' : 'Set available'}</button><button type="button" disabled={busyId !== null} onClick={() => void removeDoctor(doctor)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 disabled:opacity-50">Remove</button></div></td></tr>)}{!visibleDoctors.length && <tr><td colSpan={5} className="px-4 py-7 text-center text-sm text-slate-500">{doctors.length ? 'No doctors match your search.' : 'No doctors on the roster yet. Add one below.'}</td></tr>}</tbody></table></div>
    <div className="mt-6 border-t border-slate-100 pt-5"><h3 className="mb-3 font-bold text-slate-900">Add a doctor</h3><form onSubmit={(event) => void addDoctor(event)} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><label className="text-xs font-semibold text-slate-600">Doctor name<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Dr. Asha Mehta" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" /></label><label className="text-xs font-semibold text-slate-600">Specialty<select required value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900"><option value="">Choose a specialty</option>{hospitalSpecialties.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Shift starts<input type="time" value={shiftStart} onChange={(event) => setShiftStart(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" /></label><label className="text-xs font-semibold text-slate-600">Shift ends<input type="time" value={shiftEnd} onChange={(event) => setShiftEnd(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" /></label><label className="text-xs font-semibold text-slate-600">Duty status<select value={dutyStatus} onChange={(event) => setDutyStatus(event.target.value as typeof dutyStatus)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900"><option value="available">Available</option><option value="on_call">On call</option><option value="off_duty">Off duty</option></select></label><button type="submit" disabled={busyId !== null || !name.trim() || !specialty.trim()} className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50">{busyId === 'add' ? 'Adding…' : 'Add doctor'}</button></form><p className="mt-2 text-xs text-slate-500">The specialty list is shared with hospital matching. New doctors start available.</p></div>
  </section>;
}

function ActivityLog() {
  const [entries, setEntries] = useState<Array<{ _id: string; action: string; actorName?: string; details: Record<string, unknown>; createdAt: string; isDemo?: boolean }>>([]);
  const [message, setMessage] = useState('Loading activity…');
  useEffect(() => {
    let active = true;
    const demoEntries = getHospitalAdminDemoActivity();
    setEntries(demoEntries);
    const refresh = async () => {
      try {
        const response = await fetch('/api/hospital-admin/activity', { cache: 'no-store' });
        const result = await readApiJson<{ entries?: typeof entries; error?: string }>(response, 'Could not load the activity log.');
        if (!response.ok) throw new Error(result.error || 'Could not load the activity log.');
        if (active) { setEntries([...getHospitalAdminDemoActivity(), ...(result.entries ?? [])]); setMessage(''); }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? `${error.message} Demo activity is shown below.` : 'Could not load live activity. Demo activity is shown below.');
      }
    };
    void refresh();
    const onDemoUpdated = () => { setEntries([...getHospitalAdminDemoActivity()]); void refresh(); };
    window.addEventListener('hospital-admin-demo-updated', onDemoUpdated);
    return () => { active = false; window.removeEventListener('hospital-admin-demo-updated', onDemoUpdated); };
  }, []);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Audit / activity log</h2><p className="mt-1 text-sm text-slate-500">Recent changes made by hospital staff.</p>{message && <p className="mt-4 text-sm text-slate-500">{message}</p>}<ul className="mt-4 divide-y divide-slate-100">{entries.map((entry) => <li key={entry._id} className="py-3"><p className="font-semibold">{entry.action}{entry.isDemo && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Demo</span>}</p><p className="mt-1 text-xs text-slate-500">{entry.actorName || 'Hospital staff'} · {new Date(entry.createdAt).toLocaleString()}</p>{Object.keys(entry.details || {}).length > 0 && <p className="mt-1 text-xs text-slate-600">{JSON.stringify(entry.details)}</p>}</li>)}{!message && !entries.length && <li className="py-4 text-sm text-slate-500">No activity has been recorded yet.</li>}</ul></section>;
}

function HospitalAdminContent({ hospitalName }: { hospitalName: string }) {
  const [section, setSection] = useState<'cases' | 'beds' | 'doctors' | 'patients' | 'activity' | 'simulation' | 'settings'>('cases');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [simulationMessage, setSimulationMessage] = useState('');
  useEffect(() => { const refresh = async () => { try { const response = await fetch('/api/hospital-requests', { cache: 'no-store' }); const result = await readApiJson<{ requests?: Array<{ status: string }> }>(response, 'Could not refresh pending cases.'); if (response.ok) setPendingCount((result.requests ?? []).filter((item) => item.status === 'pending').length); } catch { /* The inbox shows its own actionable loading error. */ } }; void refresh(); const timer = window.setInterval(() => void refresh(), 10000); return () => window.clearInterval(timer); }, []);
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Hospital administration</p></div></div>
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search beds, specialties, cases, patients" label="Search this hospital's beds, specialties, cases, and patients" className="hidden w-full max-w-sm sm:block" />
        <ProfileMenu />
      </header>
      <div className="px-3 py-4 sm:px-5 sm:py-5 xl:px-8">
        <section className="mx-auto mb-4 flex max-w-screen-2xl flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">{(hospitalName || 'H').slice(0, 1).toLocaleUpperCase()}</span><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-bold">{hospitalName || 'Hospital operations'}</h1><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800"><ShieldCheck className="mr-1 inline h-3 w-3" />Staff triage</span></div><p className="mt-0.5 text-xs text-slate-500">Facility management · capacity and patient workflow</p></div></section>
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search beds, specialties, cases, or patients" label="Search this hospital's bed capacity, specialties, cases, and patients" className="mx-auto mb-4 max-w-screen-2xl sm:hidden" />
        <div className="mx-auto grid max-w-screen-2xl items-start gap-4 md:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)]">
          <nav aria-label="Hospital admin sections" className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 md:sticky md:top-4 md:self-start md:flex-col md:overflow-visible">
            {[
              { key: 'cases' as const, label: `Incoming Cases${pendingCount ? ` (${pendingCount})` : ''}` },
              { key: 'beds' as const, label: 'Bed Management' },
              { key: 'doctors' as const, label: 'Doctors & Specialties' },
              { key: 'patients' as const, label: 'Patients Admitted' },
              { key: 'activity' as const, label: 'Audit / Activity' },
              { key: 'simulation' as const, label: 'Demo Simulation' },
              { key: 'settings' as const, label: 'Settings' },
            ].map((item) => <button key={item.key} type="button" onClick={() => setSection(item.key)} className={`shrink-0 rounded-lg px-3 py-2.5 text-left text-sm font-semibold md:w-full ${section === item.key ? 'bg-sky-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{item.label}</button>)}
          </nav>
          <div className="min-w-0">
            {section === 'beds' && <BedCapacityCard hospitalName={hospitalName} searchQuery={searchQuery} />}
    {section === 'doctors' && <DoctorRoster searchQuery={searchQuery} />}
            {section === 'patients' && <PatientsAdmitted searchQuery={searchQuery} />}
            {section === 'cases' && <HospitalRequestInbox searchQuery={searchQuery} />}
            {section === 'activity' && <ActivityLog />}
            {section === 'settings' && <SettingsView />}
            {section === 'simulation' && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Demo simulation panel</h2><p className="mt-1 text-sm text-slate-500">Preview stale-data and diversion states locally. The last-bed race uses an isolated test counter.</p>{simulationMessage && <p role="status" className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{simulationMessage}</p>}<div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setSimulationMessage('Preview only: capacity would be marked stale. Live hospital data was not changed.')} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Preview stale data</button><button type="button" onClick={async () => { try { const response = await fetch('/api/hospital-admin/simulate-concurrency', { method: 'POST' }); const result = await readApiJson<{ message?: string; error?: string }>(response, 'Could not run the concurrency simulation.'); setSimulationMessage(response.ok ? result.message || 'The concurrency simulation completed.' : result.error || 'Could not run the concurrency simulation.'); } catch (error) { setSimulationMessage(error instanceof Error ? error.message : 'Could not run the concurrency simulation.'); } }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Fire two simultaneous requests</button><button type="button" onClick={() => setSimulationMessage('Preview only: new requests would be diverted. Live hospital intake was not changed.')} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">Preview hospital offline</button></div></section>}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function HospitalAdminDashboard({ hospitalName }: { hospitalName: string }) {
  return <HospitalAdminContent hospitalName={hospitalName} />;
}
