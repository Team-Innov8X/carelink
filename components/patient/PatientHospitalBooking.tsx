'use client';

import { useCallback, useEffect, useState } from 'react';
import { BedDouble, MapPin, RefreshCw } from '../icons';
import { useCareLink } from '../../context/CareLinkContext';

type BedCount = { total: number; available: number };
type Hospital = { id: string; name: string; address?: string; location?: { address?: string }; beds?: { general?: BedCount; icu?: BedCount; trauma?: BedCount }; status: string };
type ApiHospital = { id?: string; _id?: string; name: string; address?: string | { street?: string; city?: string; state?: string }; location?: { address?: string }; beds?: Hospital['beds']; status: string };
type BedResource = { _id: string; hospitalId: string; type: string; category: string; totalQuantity: number; availableQuantity: number; heldQuantity?: number; status?: string };
type PatientHold = { id?: string; _id?: string; hospitalId: string; status: string; queuePosition?: number; expiresAt?: string; createdAt: string };

export function PatientHospitalBooking() {
  const { setActiveTab, setSelectedHospitalId } = useCareLink();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [resources, setResources] = useState<BedResource[]>([]);
  const [holds, setHolds] = useState<PatientHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyResource, setBusyResource] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [hospitalResponse, holdResponse] = await Promise.all([
        fetch('/api/hospitals?registeredOnly=true', { cache: 'no-store' }),
        fetch('/api/holds/mine', { cache: 'no-store' }),
      ]);
      const [hospitalData, holdData] = await Promise.all([
        hospitalResponse.json().catch(() => []),
        holdResponse.json().catch(() => ({})),
      ]);
      if (!hospitalResponse.ok) throw new Error(hospitalData.error || 'Could not load registered hospitals.');
      if (!holdResponse.ok) throw new Error(holdData.error || 'Could not load your bed requests.');
      const rawHospitals = Array.isArray(hospitalData) ? hospitalData as ApiHospital[] : [];
      const hospitalById = new Map<string, Hospital>();
      rawHospitals.forEach((hospital) => {
        const id = String(hospital.id || hospital._id || '');
        const address = typeof hospital.address === 'string' ? hospital.address : [hospital.address?.street, hospital.address?.city, hospital.address?.state].filter(Boolean).join(', ');
        if (id) hospitalById.set(id, { ...hospital, id, address: address || hospital.location?.address || '' });
      });
      const liveHospitals = Array.from(hospitalById.values());
      setHospitals(liveHospitals);
      setHolds(Array.isArray(holdData.holds) ? holdData.holds : []);
      const resourceSets = await Promise.all(liveHospitals.map(async (hospital) => {
        const response = await fetch(`/api/hospitals/${encodeURIComponent(hospital.id)}/resources`, { cache: 'no-store' });
        const data = await response.json().catch(() => []);
        if (!response.ok || !Array.isArray(data)) return [];
        return data.filter((resource: BedResource) => resource.type === 'bed') as BedResource[];
      }));
      setResources(resourceSets.flat());
    } catch (cause) {
      setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'Could not load live bed availability.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(initial); }, [refresh]);

  const book = async (resource: BedResource) => {
    setBusyResource(resource._id);
    setMessage(null);
    try {
      const response = await fetch('/api/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: resource.hospitalId, resourceId: resource._id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not submit this bed request. Availability may have changed.');
      setMessage({ kind: 'success', text: result.status === 'pending' ? 'Bed request submitted. It is pending hospital confirmation; it is not confirmed yet.' : `Bed request added to the queue${result.queuePosition ? ` at position ${result.queuePosition}` : ''}.` });
      await refresh();
    } catch (cause) {
      setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'Could not submit this bed request.' });
    } finally {
      setBusyResource(null);
    }
  };

  const statusLabel = (hold: PatientHold) => hold.status === 'pending'
    ? `Pending hospital confirmation${hold.expiresAt ? ` · hold expires ${new Date(hold.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
    : hold.status === 'queued' ? `Queued${hold.queuePosition ? ` · position ${hold.queuePosition}` : ''}` : hold.status.replaceAll('_', ' ');

  return <section className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-sky-50 p-3 text-sky-700"><BedDouble className="h-6 w-6" /></span><div><h1 className="text-xl font-bold text-slate-900">Hospitals & Bed Requests</h1><p className="mt-1 text-sm text-slate-500">Browse registered hospitals and live bed availability. The hospital confirms bed requests.</p></div></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh availability</button>
    </header>
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${message.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{message.text}</p>}
    {holds.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-900">Your bed requests</h2><div className="mt-3 space-y-2">{holds.map((hold) => <p key={hold.id ?? hold._id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span className="font-medium text-slate-800">{hospitals.find((hospital) => hospital.id === hold.hospitalId)?.name ?? 'Hospital'} · {new Date(hold.createdAt).toLocaleString()}</span><span className="font-semibold capitalize text-sky-800">{statusLabel(hold)}</span></p>)}</div></section>}
    {loading ? <p role="status" className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading registered hospitals…</p> : hospitals.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-10 text-center"><MapPin className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-400">No hospitals registered yet</p></div> : <div className="grid gap-4 md:grid-cols-2">{hospitals.map((hospital) => {
      const bedResources = resources.filter((resource) => resource.hospitalId === hospital.id);
      const bedSummary = [hospital.beds?.general, hospital.beds?.icu, hospital.beds?.trauma].filter((bed): bed is BedCount => Boolean(bed)).reduce((summary, bed) => ({ total: summary.total + bed.total, available: summary.available + bed.available }), { total: 0, available: 0 });
      return <article key={hospital.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><div><button type="button" onClick={() => { setSelectedHospitalId(hospital.id); setActiveTab('hospital-view'); }} className="text-left text-lg font-bold text-slate-900 hover:text-sky-700">{hospital.name}</button><p className="mt-1 text-sm text-slate-500">{hospital.address || hospital.location?.address || 'Hospital address not listed'}</p><p className="mt-2 text-sm font-semibold text-slate-700">{bedSummary.available} beds available · {bedSummary.total} total capacity</p><button type="button" onClick={() => { setSelectedHospitalId(hospital.id); setActiveTab('hospital-view'); }} className="mt-3 text-sm font-semibold text-sky-700 hover:underline">View hospital details</button></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{hospital.status}</span></div>
        {!bedResources.length ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No live bed resources are listed for this hospital.</p> : <div className="mt-4 space-y-2">{bedResources.map((resource) => {
          const available = Math.max(0, resource.availableQuantity - (resource.heldQuantity ?? 0));
          return <div key={resource._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4"><div><p className="text-sm font-semibold capitalize text-slate-900">{resource.category.replaceAll('_', ' ')} bed</p><p className="mt-0.5 text-sm text-slate-500">{available} available · {resource.totalQuantity} total</p></div><button type="button" onClick={() => void book(resource)} disabled={available <= 0 || busyResource === resource._id} className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">{busyResource === resource._id ? 'Submitting…' : available <= 0 ? 'Unavailable' : 'Request Bed'}</button></div>;
        })}</div>}
      </article>;
    })}</div>}
  </section>;
}
