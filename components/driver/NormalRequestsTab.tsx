'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, MapPin, Phone, RefreshCw, X } from '@/components/icons';
import { readApiResponse } from './readApiResponse';

export type NormalDriverRequest = {
  id: string;
  patientName: string;
  patientPhone?: string;
  incidentType: string;
  location: { latitude: number; longitude: number };
  distanceKm: number | null;
  preferredTime?: string;
  notes?: string;
  createdAt: string;
  assignmentExpiresAt?: string;
};

export function NormalRequestsTab({ available, hasActiveRequest, busy, onAccept, onCountChange, onViewMap }: {
  available: boolean;
  hasActiveRequest: boolean;
  busy: boolean;
  onAccept: (id: string) => void;
  onCountChange: (count: number) => void;
  onViewMap: (request: NormalDriverRequest) => void;
}) {
  const [requests, setRequests] = useState<NormalDriverRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/driver/normal-requests', { cache: 'no-store' });
      const result = await readApiResponse(response);
      if (response.status === 401) { window.location.assign('/signin'); return; }
      if (!response.ok) throw new Error(result.error || 'Could not load routine transport requests.');
      setRequests(result.requests ?? []);
      onCountChange((result.requests ?? []).length);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load routine transport requests.');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  const reject = async (id: string) => {
    const reason = window.prompt('Why are you passing on this transport request?')?.trim();
    if (!reason) return;
    try {
      const response = await fetch(`/api/sos/${encodeURIComponent(id)}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      const result = await readApiResponse(response);
      if (response.status === 401) { window.location.assign('/signin'); return; }
      if (!response.ok) throw new Error(result.error || 'Could not pass on this request.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not pass on this request.');
    }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Normal transport requests</h2><p className="mt-1 text-sm text-slate-500">Scheduled and non-emergency rides for patients.</p></div><button type="button" onClick={() => void refresh()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"><RefreshCw className="h-4 w-4" />Refresh</button></div>
    {error && <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={() => void refresh()} className="min-h-10 rounded-lg bg-rose-700 px-3 font-semibold text-white">Retry</button></div>}
    {loading ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Loading routine requests…</p> : requests.length ? <div className="space-y-3">{requests.map((request) => <article key={request.id} className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{request.incidentType.replace(/^Routine Transport:\s*/i, '')}</h3><p className="mt-1 text-sm text-slate-700">{request.patientName}{request.patientPhone ? ` · ${request.patientPhone}` : ''}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{request.distanceKm === null ? 'Distance unavailable' : `${request.distanceKm} km away`} · pickup {request.location.latitude.toFixed(4)}, {request.location.longitude.toFixed(4)}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" />{request.preferredTime || 'As soon as available'}</p>{request.notes && <p className="mt-2 text-xs leading-5 text-slate-600">{request.notes}</p>}</div>{request.assignmentExpiresAt && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">Dispatcher offer</span>}</div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onViewMap(request)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800"><MapPin className="h-4 w-4" />View pickup</button><button type="button" disabled={busy || hasActiveRequest || !available} onClick={() => onAccept(request.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />Accept ride</button><button type="button" disabled={busy || hasActiveRequest} onClick={() => void reject(request.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><X className="h-4 w-4" />Pass</button>{request.patientPhone && <a href={`tel:${request.patientPhone}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800"><Phone className="h-4 w-4" />Call patient</a>}</div>
    </article>)}</div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No routine transport requests are waiting right now.</p>}
    {!available && requests.length > 0 && <p className="mt-3 text-xs text-slate-500">Go available from the Dashboard tab before accepting a ride.</p>}
  </section>;
}
