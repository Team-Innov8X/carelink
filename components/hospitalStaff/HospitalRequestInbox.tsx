'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BedDouble, Check, Clock, RefreshCw, Stethoscope } from 'lucide-react';

type HospitalRequest = {
  _id: string;
  sosRequestId: string;
  requestType?: 'sos' | 'bed';
  hospitalName: string;
  patientName: string;
  patientPhone?: string;
  incidentType: string;
  requiredEquipment?: string[];
  requiredSpecialty?: string;
  bedCategory?: string;
  status: 'pending' | 'accepting' | 'accepted' | 'rejected';
  createdAt: string;
};

export function HospitalRequestInbox() {
  const [requests, setRequests] = useState<HospitalRequest[]>([]);
  const [tab, setTab] = useState<'incoming' | 'accepted' | 'declined'>('incoming');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const requestStatuses = useRef(new Map<string, HospitalRequest['status']>());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/hospital-requests', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load patient requests.');
      const nextRequests = (result.requests ?? []) as HospitalRequest[];
      const acceptedRequestChanged = nextRequests.some((request) => request.status === 'accepted' && requestStatuses.current.get(request._id) !== 'accepted');
      requestStatuses.current = new Map(nextRequests.map((request) => [request._id, request.status]));
      setRequests(nextRequests);
      if (acceptedRequestChanged) window.dispatchEvent(new Event('carelink-data-refresh'));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load patient requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [refresh]);

  const accept = async (request: HospitalRequest) => {
    setBusyId(request._id);
    setMessage('');
    try {
      const response = await fetch(`/api/hospital-requests/${encodeURIComponent(request._id)}/accept`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not accept this patient request.');
      setMessage(`${request.patientName}'s request was accepted. Bed and doctor capacity were reserved, and the patient was notified.`);
      setTab('accepted');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not accept this patient request.');
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const incoming = requests.filter((request) => request.status === 'pending' || request.status === 'accepting');
  const accepted = requests.filter((request) => request.status === 'accepted');
  const declined = requests.filter((request) => request.status === 'rejected');
  const visibleRequests = tab === 'incoming' ? incoming : tab === 'accepted' ? accepted : declined;

  return <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-xs">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">Patient Requests</h2><p className="mt-1 text-xs text-slate-500">SOS and bed requests refresh automatically. Acceptance reserves a matching bed and doctor.</p></div>
      <button type="button" onClick={() => void refresh()} aria-label="Refresh patient requests" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button>
    </div>
    <div className="mb-4 flex gap-2 border-b border-slate-100">
      <button type="button" onClick={() => setTab('incoming')} aria-current={tab === 'incoming' ? 'page' : undefined} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'incoming' ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-500'}`}>Incoming <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{incoming.length}</span></button>
      <button type="button" onClick={() => setTab('accepted')} aria-current={tab === 'accepted' ? 'page' : undefined} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'accepted' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'}`}>Accepted <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{accepted.length}</span></button>
      <button type="button" onClick={() => setTab('declined')} aria-current={tab === 'declined' ? 'page' : undefined} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'declined' ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-500'}`}>Declined <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{declined.length}</span></button>
    </div>
    {message && <p role="status" className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900">{message}</p>}
    {loading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading patient requests…</p> : visibleRequests.length ? <div className="space-y-3">{visibleRequests.map((request) => <article key={request._id} className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{request.patientName} · {request.incidentType}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{request.requestType === 'bed' ? 'Bed request' : 'SOS'}</span></div><p className="mt-1 text-xs text-slate-600">{request.patientPhone || 'No phone provided'} · Ref {request.sosRequestId.slice(0, 8)}</p>{(request.requiredEquipment ?? []).length > 0 && <p className="mt-1 text-xs text-slate-600">Needs: {(request.requiredEquipment ?? []).join(', ')}</p>}<div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-slate-700">{request.bedCategory && <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{request.bedCategory.toUpperCase()} bed</span>}{request.requiredSpecialty && <span className="inline-flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" />{request.requiredSpecialty} doctor</span>}</div></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${request.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' : request.status === 'pending' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{request.status}</span></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1 text-[11px] text-slate-500"><Clock className="h-3.5 w-3.5" />{new Date(request.createdAt).toLocaleString()}</p>{request.status === 'pending' && <button type="button" disabled={busyId === request._id} onClick={() => void accept(request)} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{busyId === request._id ? 'Checking capacity…' : 'Accept & reserve capacity'}</button>}{request.status === 'accepted' && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-800"><Check className="h-4 w-4" />Bed and doctor reserved</span>}</div>
    </article>)}</div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">{tab === 'incoming' ? 'No patient requests are waiting for this hospital.' : tab === 'accepted' ? 'No accepted requests yet.' : 'No declined requests.'}</p>}
  </section>;
}
