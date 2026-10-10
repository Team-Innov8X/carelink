'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, BedDouble, CheckCircle2, Clock, Stethoscope } from '../icons';

type PatientRequest = {
  id: string;
  status: string;
  incidentType: string;
  createdAt: string;
  acceptedAt?: string;
  arrivedAt?: string | null;
  completedAt?: string;
  driverAssigned?: boolean;
  hospitalRequest: null | { status: string; hospitalName: string; acceptedAt?: string; bedCategory?: string; requiredSpecialty?: string };
  recommendation?: null | { conditionId: string; conditionLabel: string; status: string; selectedHospitalName?: string; selectedHospitalId?: string; responseDeadline?: string; unservedReason?: string; fallbackText?: string; reroutes: number; ranked?: Array<{ hospitalId: string; travelTimeMinutes: number }>; timeline: Array<{ status: string; at: string; reason: string; hospitalName?: string }> };
};
type NearbyHospital = { id: string; name: string; travelTimeMinutes: number; directionsUrl: string; label: string };

export function PatientSOSStatus() {
  const [requests, setRequests] = useState<PatientRequest[]>([]);
  const [error, setError] = useState('');
  const [nearestByRequest, setNearestByRequest] = useState<Record<string, NearbyHospital[]>>({});
  const nearbyLoaded = useRef(new Set<string>());
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sos', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load emergency requests.');
      setRequests(result.requests ?? []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load emergency requests.');
    }
  }, []);

  useEffect(() => {
    for (const request of requests) {
      if (request.recommendation?.status !== 'unserved' || nearbyLoaded.current.has(request.id)) continue;
      nearbyLoaded.current.add(request.id);
      void fetch(`/api/sos/${encodeURIComponent(request.id)}/hospitals?limit=5`, { cache: 'no-store' })
        .then(async (response) => response.ok ? response.json() as Promise<{ hospitals?: NearbyHospital[]; unverifiedNearby?: NearbyHospital[] }> : null)
        .then((result) => { if (result) setNearestByRequest((current) => ({ ...current, [request.id]: [...(result.hospitals ?? []), ...(result.unverifiedNearby ?? [])] })); })
        .catch(() => nearbyLoaded.current.delete(request.id));
    }
  }, [requests]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    window.addEventListener('carelink-sos-updated', refresh);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); window.removeEventListener('carelink-sos-updated', refresh); };
  }, [refresh]);

  if (!requests.length && !error) return null;
  return <section className="mb-6 rounded-2xl border border-sky-200 bg-white p-5 shadow-xs" aria-live="polite">
    <div className="mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-sky-700" /><h2 className="font-bold text-slate-900">Your Emergency Requests</h2><span className="ml-auto text-xs text-slate-500">Live updates</span></div>
    {error && <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}
    <div className="space-y-3">{requests.slice(0, 5).map((request) => {
      const hospital = request.hospitalRequest;
      const hospitalAccepted = hospital?.status === 'accepted';
      const driverAccepted = request.status === 'accepted' && request.driverAssigned !== false;
      const driverCompleted = request.status === 'completed';
      const requestCancelled = request.status === 'cancelled';
      const driverStatus = driverCompleted
        ? 'Driver response completed'
        : requestCancelled
          ? 'Request closed'
          : request.arrivedAt
            ? 'Driver has arrived'
            : driverAccepted
              ? 'Driver accepted · en route'
              : 'Waiting for a driver';
      const driverStatusClass = driverAccepted && !driverCompleted
        ? 'bg-emerald-100 text-emerald-800'
        : driverCompleted
          ? 'bg-slate-100 text-slate-700'
          : requestCancelled
            ? 'bg-rose-100 text-rose-800'
            : 'bg-amber-100 text-amber-800';
      return <article key={request.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-slate-900">{request.incidentType}</p><p className="mt-1 text-xs text-slate-500">Reference {request.id.slice(0, 8)} · {new Date(request.createdAt).toLocaleString()}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${driverStatusClass}`}>{driverStatus}</span></div>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">{driverAccepted || driverCompleted ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Clock className="h-4 w-4 text-amber-600" />}{driverAccepted ? `An emergency driver accepted your request${request.acceptedAt ? ` at ${new Date(request.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}.` : driverCompleted ? 'The driver has completed this response.' : requestCancelled ? 'This request was closed because another request was accepted.' : 'Your request is being sent to available drivers.'}</p>
        {hospital && <div className="mt-3 border-t border-slate-200 pt-3"><p className="flex items-center gap-2 text-sm text-slate-700">{hospitalAccepted ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Clock className="h-4 w-4 text-amber-600" />}{hospitalAccepted ? `${hospital.hospitalName} accepted your hospital request.` : hospital.status === 'rejected' ? `${hospital.hospitalName} declined your request.` : `${hospital.hospitalName} is reviewing the hospital request.`}</p>{hospitalAccepted && <div className="mt-2 flex flex-wrap gap-4 text-xs font-medium text-emerald-900">{hospital.bedCategory && <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{hospital.bedCategory.toUpperCase()} bed reserved</span>}{hospital.requiredSpecialty && <span className="inline-flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" />{hospital.requiredSpecialty} doctor assigned</span>}</div>}</div>}
        {request.recommendation && <div className="mt-3 rounded-lg border border-[#1E5A8E]/20 bg-white p-3"><p className="text-xs font-semibold text-[#1E5A8E]">Simulation / decision support</p><p className="mt-1 text-sm font-semibold text-slate-900">Condition · {request.recommendation.conditionLabel}</p><p className="mt-1 text-sm text-slate-700">Hospital · {request.recommendation.selectedHospitalName ?? 'Finding a feasible hospital'}{request.recommendation.selectedHospitalId && ` · ETA ${request.recommendation.ranked?.find((candidate) => candidate.hospitalId === request.recommendation?.selectedHospitalId)?.travelTimeMinutes ?? 'updating'} min`}</p><p className={`mt-1 text-sm font-semibold ${request.recommendation.status === 'confirmed' ? 'text-[#2E7D4F]' : request.recommendation.status === 'unserved' ? 'text-[#C0362C]' : 'text-[#C98A1F]'}`}>{request.recommendation.status === 'requested' ? 'Requesting bed confirmation' : request.recommendation.status === 'confirmed' ? 'Bed request accepted' : request.recommendation.status === 'unserved' ? `No hospital confirmed · ${request.recommendation.unservedReason?.replaceAll('_', ' ')}` : request.recommendation.status}</p>{request.recommendation.fallbackText && <p className="mt-1 text-sm font-semibold text-[#C0362C]">{request.recommendation.fallbackText}</p>}<h3 className="mt-3 text-xs font-bold text-slate-700">Request timeline</h3><ol className="mt-1 space-y-1">{request.recommendation.timeline.map((event, index) => <li key={`${event.status}-${index}`} className="text-xs text-slate-600"><span className="font-semibold">{event.status.replaceAll('_', ' ')}{event.hospitalName ? ` · ${event.hospitalName}` : ''}</span> · {event.reason} · {new Date(event.at).toLocaleTimeString()}</li>)}</ol>{request.recommendation.status === 'unserved' && <div className="mt-3 border-t border-slate-200 pt-2"><p className="text-xs font-bold text-[#C0362C]">Nearest hospitals for a manual call</p>{nearestByRequest[request.id]?.length ? <ul className="mt-2 space-y-2">{nearestByRequest[request.id].map((candidate) => <li key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{candidate.name} · {candidate.travelTimeMinutes} min <span className="block text-xs text-slate-500">{candidate.label}</span></span><a href={candidate.directionsUrl} target="_blank" rel="noreferrer" className="min-h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#1E5A8E]">Directions</a></li>)}</ul> : <p className="mt-1 text-xs text-slate-600">Loading nearby hospital options…</p>}</div>}</div>}
      </article>;
    })}</div>
  </section>;
}
