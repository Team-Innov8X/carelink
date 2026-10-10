'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, RefreshCw } from '@/components/icons';
import { DelayedSkeleton, HospitalRequestListSkeleton } from '@/components/common/Skeletons';
import { classifyEmergencyLevel, EmergencyLevelTag } from '../common/EmergencyLevelTag';
import { readApiJson } from '@/lib/client-api';
import { acceptHospitalAdminDemoCase, getHospitalAdminDemoAcceptingRequests, getHospitalAdminDemoCases, rejectHospitalAdminDemoCase } from '@/lib/hospital-admin-demo';

type HospitalRequest = {
  _id: string;
  sosRequestId: string;
  requestType?: 'sos' | 'bed';
  hospitalName: string;
  patientName: string;
  patientPhone?: string;
  incidentType: string;
  requiredEquipment: string[];
  status: 'pending' | 'accepting' | 'accepted' | 'rejected' | 'queued' | 'discharged';
  createdAt: string;
  holdId?: string;
  driverAssigned?: boolean;
  location?: { latitude: number; longitude: number };
  sosStatus?: string;
  admitted?: boolean;
  etaMinutes?: number;
  driverAcceptedAt?: string;
  bedCategory?: string;
  rejectionReason?: string;
  reservationExpiresAt?: string;
  acceptedAt?: string;
  admittedAt?: string;
  driverTripStage?: string;
  driverTripTimestamps?: Record<string, string>;
  driverVitalsUpdate?: { bp: string; heartRate: number; spO2: number; updatedAt: string } | null;
  driverIssue?: { message: string; updatedAt: string; etaDelayMinutes?: number } | null;
  isDemo?: boolean;
  queuePosition?: number;
};

export function HospitalRequestInbox({ searchQuery = '' }: { searchQuery?: string }) {
  const [requests, setRequests] = useState<HospitalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [clockNow, setClockNow] = useState(0);
  const [acceptingRequests, setAcceptingRequests] = useState(true);
  const query = searchQuery.trim().toLocaleLowerCase();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/hospital-requests', { cache: 'no-store' });
      const result = await readApiJson<{ requests?: HospitalRequest[]; acceptingRequests?: boolean; error?: string }>(response, 'Could not load patient requests.');
      if (!response.ok) throw new Error(result.error || 'Could not load patient requests.');
      const liveRequests = result.requests ?? [];
      setAcceptingRequests(result.acceptingRequests ?? getHospitalAdminDemoAcceptingRequests());
      setRequests([...getHospitalAdminDemoCases().filter((item) => item.status !== 'discharged').map((item) => ({ ...item, admitted: item.status === 'accepted' && Boolean(item.admittedAt) })), ...liveRequests]);
      setMessage('');
    } catch (error) {
      setRequests(getHospitalAdminDemoCases().filter((item) => item.status !== 'discharged').map((item) => ({ ...item, admitted: item.status === 'accepted' && Boolean(item.admittedAt) })));
      setAcceptingRequests(getHospitalAdminDemoAcceptingRequests());
      setMessage(error instanceof Error ? error.message : 'Could not load patient requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    window.addEventListener('hospital-admin-demo-updated', refresh);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.removeEventListener('hospital-admin-demo-updated', refresh);
    };
  }, [refresh]);
  useEffect(() => { const timer = window.setTimeout(() => setClockNow(Date.now()), 0); const interval = window.setInterval(() => setClockNow(Date.now()), 30_000); return () => { window.clearTimeout(timer); window.clearInterval(interval); }; }, []);

  const accept = async (request: HospitalRequest) => {
    if (!acceptingRequests) { setMessage('This hospital is diverted and cannot accept incoming requests. Resume intake in Bed Management first.'); return; }
    setBusyId(request._id);
    setMessage('');
    try {
      if (request.isDemo) {
        const demoResult = acceptHospitalAdminDemoCase(request._id);
        if (!demoResult.success) throw new Error(demoResult.message);
        setMessage(demoResult.message);
        await refresh();
        return;
      }
      const response = request.requestType === 'bed'
        ? await fetch(`/api/holds/${encodeURIComponent(request.holdId || request._id)}/confirm`, { method: 'PATCH' })
        : await fetch(`/api/hospital-requests/${encodeURIComponent(request._id)}/accept`, { method: 'POST' });
      const result = await readApiJson<{ error?: string }>(response, 'Could not accept this patient request.');
      if (!response.ok) throw new Error(result.error || 'Could not accept this patient request.');
      window.dispatchEvent(new Event('carelink-data-refresh'));
      setMessage(`${request.patientName}'s request was accepted. Recording admission…`);
      await admit(request);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not accept this patient request.');
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const admit = async (request: HospitalRequest) => {
    setBusyId(request._id);
    setMessage('');
    try {
      const response = await fetch('/api/hospital-admin/admissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.requestType === 'bed' ? { holdId: request.holdId || request._id } : { hospitalRequestId: request._id }) });
      const result = await readApiJson<{ error?: string }>(response, 'Could not record patient admission.');
      if (!response.ok) throw new Error(result.error || 'Could not record patient admission.');
      setMessage(`${request.patientName} was recorded as admitted.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not record patient admission.');
    } finally { setBusyId(null); }
  };

  const reject = async (request: HospitalRequest) => {
    const reason = rejectReason[request._id];
    if (!reason && request.requestType !== 'bed') { setMessage('Choose a reason before rejecting this request.'); return; }
    setBusyId(request._id); setMessage('');
    try {
      if (request.isDemo) {
        const demoResult = rejectHospitalAdminDemoCase(request._id);
        if (!demoResult.success) throw new Error(demoResult.message);
        setMessage(demoResult.message);
        await refresh();
        return;
      }
      const response = request.requestType === 'bed'
        ? await fetch(`/api/holds/${encodeURIComponent(request.holdId || request._id)}/reject`, { method: 'PATCH' })
        : await fetch(`/api/hospital-requests/${encodeURIComponent(request._id)}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      const result = await readApiJson<{ error?: string }>(response, 'Could not reject this patient request.');
      if (!response.ok) throw new Error(result.error || 'Could not reject this patient request.');
      setMessage(`${request.patientName}'s request was rejected.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not reject this patient request.'); }
    finally { setBusyId(null); }
  };

  const visibleRequests = requests.filter((request) => `${request.patientName} ${request.patientPhone || ''} ${request.incidentType} ${request.status} ${request.requiredEquipment.join(' ')}`.toLocaleLowerCase().includes(query)).sort((a, b) => {
    const rank = (value: HospitalRequest) => classifyEmergencyLevel(`${value.incidentType} ${value.requiredEquipment.join(' ')}`) === 'HIGH EMERGENCY' ? 0 : classifyEmergencyLevel(`${value.incidentType} ${value.requiredEquipment.join(' ')}`) === 'URGENT' ? 1 : 2;
    return rank(a) - rank(b) || (a.etaMinutes ?? Infinity) - (b.etaMinutes ?? Infinity) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    {!acceptingRequests && <p role="status" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">Hospital intake is diverted. Incoming requests cannot be accepted until intake resumes.</p>}
    <div className="mb-4 flex items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">Incoming Patient Requests</h2><p className="mt-1 text-xs text-slate-500">Bed and SOS requests refresh automatically. Accepting a live request reserves one available bed.</p></div>
      <button type="button" onClick={() => void refresh()} aria-label="Refresh patient requests" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button>
    </div>
    {message && <p role="status" className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900">{message}</p>}
    {requests.some((request) => request.driverTripStage || request.driverVitalsUpdate || request.driverIssue) && <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4"><h3 className="font-bold text-slate-900">Paramedic updates</h3><div className="mt-2 space-y-2">{requests.filter((request) => request.driverTripStage || request.driverVitalsUpdate || request.driverIssue).map((request) => <article key={`paramedic-${request._id}`} className="rounded-lg border border-amber-100 bg-white p-3 text-sm"><p className="font-semibold text-slate-900">{request.patientName} · {request.driverTripStage?.replaceAll('_', ' ') || 'Trip in progress'}</p>{request.driverTripTimestamps && <p className="mt-1 text-xs text-slate-500">{Object.entries(request.driverTripTimestamps).map(([stage, date]) => `${stage.replaceAll('_', ' ')} ${new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).join(' · ')}</p>}{request.driverVitalsUpdate && <p className="mt-1 text-xs text-slate-700">Vitals · BP {request.driverVitalsUpdate.bp} · HR {request.driverVitalsUpdate.heartRate} bpm · SpO₂ {request.driverVitalsUpdate.spO2}% · {new Date(request.driverVitalsUpdate.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}{request.driverIssue && <p className="mt-1 text-xs font-medium text-amber-900">Driver issue · {request.driverIssue.message}{request.driverIssue.etaDelayMinutes ? ` · ETA +${request.driverIssue.etaDelayMinutes} min` : ''}</p>}</article>)}</div></section>}
    {loading ? <DelayedSkeleton><HospitalRequestListSkeleton /></DelayedSkeleton> : visibleRequests.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Patient</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Priority</th><th className="px-3 py-3">ETA / workflow</th><th className="px-3 py-3">Impact</th><th className="px-3 py-3">Vitals & notes</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRequests.map((request) => <tr key={request._id} className="align-middle">
      <td className="px-3 py-3"><p className="font-bold text-slate-900">{request.patientName}{request.isDemo && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Demo</span>}</p><p className="mt-1 text-xs text-slate-500">Ref {request.sosRequestId}</p></td><td className="px-3 py-3">{request.incidentType}<p className="mt-1 text-xs text-slate-500">{request.requestType === 'bed' ? 'Bed request' : 'SOS'}{request.bedCategory ? ` · ${request.bedCategory} bed` : ''}{request.requiredEquipment.length ? ` · ${request.requiredEquipment.join(', ')}` : ''}</p></td><td className="px-3 py-3"><EmergencyLevelTag description={`${request.incidentType} ${request.requiredEquipment.join(' ')}`} /></td><td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600"><Clock className="mr-1 inline h-3.5 w-3.5" />{request.etaMinutes != null ? `${request.etaMinutes} min${request.driverAcceptedAt ? ' · estimated' : ''}` : request.driverAssigned ? 'ETA pending' : request.status === 'queued' ? `Queue position ${request.queuePosition ?? 'pending'}` : 'Awaiting driver'}<p className="mt-1">{request.status === 'pending' ? `Await ${Math.max(0, 15 - Math.floor((clockNow - new Date(request.createdAt).getTime()) / 60000))} min response` : <span className="block">Requested {new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{request.acceptedAt && <> → Accepted {new Date(request.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}{request.driverAcceptedAt && <> → En route {new Date(request.driverAcceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}{request.admittedAt && <> → Arrived {new Date(request.admittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → Handed over</>}</span>}</p></td><td className="px-3 py-3 text-xs text-slate-700">{request.status === 'pending' ? <>{request.bedCategory || 'Bed'}: current availability will decrement by 1</> : request.status === 'accepted' ? `Reserved: ${request.bedCategory || 'bed'}` : request.rejectionReason ? `Reason: ${request.rejectionReason.replaceAll('_', ' ')}` : '—'}{request.status === 'pending' && <select aria-label={`Reason for rejecting ${request.patientName}`} value={rejectReason[request._id] || ''} onChange={(event) => setRejectReason((current) => ({ ...current, [request._id]: event.target.value }))} className="mt-1 block rounded border border-slate-200 bg-white px-2 py-1 text-xs"><option value="">Reject reason…</option><option value="no_icu_bed">No ICU bed</option><option value="specialist_unavailable">Specialist unavailable</option><option value="diverted">Hospital diverted</option><option value="other">Other</option></select>}</td><td className="px-3 py-3 text-xs text-slate-600">{request.requestType === 'sos' ? 'Vitals pending from paramedic' : `Needs ${request.requiredEquipment.join(', ') || 'bed assessment'}`}</td><td className="px-3 py-3"><div className="flex justify-end gap-2">{request.status === 'pending' && <><button type="button" disabled={busyId === request._id || !acceptingRequests} onClick={() => void accept(request)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{busyId === request._id ? 'Saving…' : '✓ Accept'}</button><button type="button" disabled={busyId === request._id || (!rejectReason[request._id] && request.requestType !== 'bed')} onClick={() => void reject(request)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-60">✕ Reject</button></>}{request.status === 'accepted' && <div className="flex items-center gap-2"><span className="text-xs font-semibold text-emerald-800">{request.admitted ? 'Admission recorded' : 'Bed reserved'}</span>{!request.admitted && <button type="button" disabled={busyId === request._id} onClick={() => void admit(request)} className="rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50">Mark admitted</button>}</div>}{request.status === 'queued' && <span className="text-xs font-semibold text-amber-800">Queued for bed</span>}{request.status === 'rejected' && <span className="text-xs font-semibold text-rose-700">Rejected</span>}</div></td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">{requests.length ? 'No cases match this search.' : 'No patient requests are waiting for this hospital.'}</p>}
  </section>;
}
