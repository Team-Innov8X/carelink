'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ambulance, Clock, MapPin, Phone } from '../icons';
import { MapView } from '../common/MapView';
import { DelayedSkeleton, RequestListSkeleton } from '../common/Skeletons';

type Coordinates = { latitude: number; longitude: number; address?: string };
type CurrentRequest = {
  id: string;
  type: 'sos' | 'normal';
  status: string;
  incidentType: string;
  location: Coordinates;
  createdAt: string;
  acceptedAt?: string | null;
  arrivedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  dispatchStatus?: string;
  tripStage?: string | null;
  tripTimestamps?: Record<string, string>;
  fallbackInstruction?: string | null;
  estimatedEtaMinutes?: number | null;
  distanceKm?: number | null;
  serverTime: string;
  pollSeconds: number;
  staleLocationSeconds: number;
  driver?: { id: string; name?: string | null; phone?: string | null; vehicleNumber?: string | null; location?: Coordinates | null; locationUpdatedAt?: string | null; accuracyM?: number | null } | null;
  destination?: { name: string; status?: string; bedCategory?: string; location?: Coordinates } | null;
};

const patientTimeline = [
  ['searching', 'Searching for driver'],
  ['accepted', 'Driver accepted'],
  ['en_route_to_patient', 'On the way'],
  ['arrived_patient', 'Arrived'],
  ['patient_on_board', 'Picked up'],
  ['en_route_hospital', 'Heading to hospital'],
  ['handover_complete', 'Completed'],
] as const;

function timelineIndex(request: CurrentRequest) {
  if (request.status === 'no_driver_found' || request.status === 'cancelled' || request.status === 'expired') return -1;
  if (request.status === 'completed' || request.tripStage === 'handover_complete') return patientTimeline.length - 1;
  if (request.tripStage === 'en_route_hospital') return 5;
  if (request.tripStage === 'patient_on_board') return 4;
  if (request.tripStage === 'arrived_patient' || request.arrivedAt) return 3;
  if (request.dispatchStatus === 'en_route_to_patient') return 2;
  if (request.status === 'accepted') return 1;
  return 0;
}

export const PatientHomeRequestBox: React.FC = () => {
  const [request, setRequest] = useState<CurrentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pollSeconds, setPollSeconds] = useState(3);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clockNow, setClockNow] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState('');
  const [etaNotice, setEtaNotice] = useState('');
  const priorEta = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/patient/active-request', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load your current request.');
      const next = result.request as CurrentRequest | null;
      if (next?.serverTime) setServerOffsetMs(new Date(next.serverTime).getTime() - Date.now());
      if (next?.pollSeconds) setPollSeconds(next.pollSeconds);
      if (next?.estimatedEtaMinutes != null && priorEta.current != null && Math.abs(next.estimatedEtaMinutes - priorEta.current) > 10) {
        setEtaNotice(`Your estimated arrival time changed by more than 10 minutes. The latest estimate is ${next.estimatedEtaMinutes} minutes.`);
      }
      if (next?.estimatedEtaMinutes != null) priorEta.current = next.estimatedEtaMinutes;
      if (!next) priorEta.current = null;
      setRequest(next);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your current request.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, pollSeconds * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('carelink-sos-updated', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener('carelink-sos-updated', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh, pollSeconds]);

  useEffect(() => {
    const initial = window.setTimeout(() => setClockNow(Date.now()), 0);
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  const cancel = async () => {
    if (!request || cancelling) return;
    if (!window.confirm(`Cancel this ${request.type === 'sos' ? 'emergency' : 'transport'} request?`)) return;
    setCancelling(true);
    setCancelMessage('');
    try {
      const endpoint = request.type === 'normal' ? `/api/requests/${encodeURIComponent(request.id)}/cancel` : `/api/sos/${encodeURIComponent(request.id)}/cancel`;
      const response = await fetch(endpoint, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'This request can no longer be cancelled.');
      setCancelMessage('Request cancelled. The status has been shared with dispatch.');
      await refresh();
      window.dispatchEvent(new Event('carelink-sos-updated'));
    } catch (cause) {
      setCancelMessage(cause instanceof Error ? cause.message : 'Could not cancel this request.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <section aria-label="Current emergency request" aria-busy="true"><h2 className="mb-3 text-lg font-bold">Current Emergency Request</h2><DelayedSkeleton><RequestListSkeleton /></DelayedSkeleton></section>;
  if (!request) return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 sm:p-6" aria-live="polite"><h2 className="text-lg font-bold">Current Emergency Request</h2>{error ? <><p role="alert" className="mt-3 text-sm text-rose-800">{error}</p><button type="button" onClick={() => void refresh()} className="mt-3 rounded-lg border border-sky-700 px-4 py-2 text-sm font-semibold text-sky-800">Try again</button></> : <p className="mt-3 text-sm text-slate-600">No active request right now.</p>}</section>;

  const stage = timelineIndex(request);
  const active = ['searching', 'accepted'].includes(request.status);
  const pickupStarted = ['patient_on_board', 'en_route_hospital', 'arrived_hospital', 'handover_complete'].includes(request.tripStage ?? '');
  const canCancel = active && !pickupStarted;
  const lastLocationAt = request.driver?.locationUpdatedAt ? new Date(request.driver.locationUpdatedAt).getTime() : null;
  const ageSeconds = lastLocationAt == null ? null : Math.max(0, Math.floor((clockNow + serverOffsetMs - lastLocationAt) / 1000));
  const locationStale = ageSeconds != null && ageSeconds > request.staleLocationSeconds;
  const patientPoint: [number, number] = [request.location.latitude, request.location.longitude];
  const driverPoint = request.driver?.location ? [request.driver.location.latitude, request.driver.location.longitude] as [number, number] : undefined;
  const hospitalPoint = request.destination?.location ? [request.destination.location.latitude, request.destination.location.longitude] as [number, number] : undefined;

  return <section className="mb-6 rounded-2xl border border-sky-200 bg-white p-5 text-slate-900 shadow-xs sm:p-6" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Current Emergency Request</h2><p className="mt-1 text-xs text-slate-500">Reference {request.id.slice(0, 10)} · {request.type === 'normal' ? 'Medical transport' : 'Emergency SOS'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${request.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' : request.status === 'no_driver_found' ? 'bg-rose-100 text-rose-800' : request.status === 'cancelled' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{request.status.replaceAll('_', ' ')}</span></div>
    <p className="mt-3 text-sm font-semibold">{request.incidentType}</p>
    {request.location.address && <p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5" />Pickup: {request.location.address}</p>}
    <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Emergency request status timeline">{patientTimeline.map(([key, label], index) => <li key={key} className={`rounded-lg border px-2 py-2 text-xs ${index <= stage ? 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-500'}`}><span className="mr-1">{index <= stage ? '✓' : '○'}</span>{label}{request.tripTimestamps?.[request.tripStage || ''] && request.tripStage === key && <span className="mt-1 block text-[10px] font-normal">{new Date(request.tripTimestamps[request.tripStage]).toLocaleTimeString()}</span>}</li>)}</ol>
    {request.status === 'no_driver_found' && <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><p className="font-bold">No driver was found</p><p className="mt-1">{request.fallbackInstruction || 'No driver accepted this request. Please contact your local emergency services.'}</p></div>}
    {request.status === 'cancelled' && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">This request was cancelled.</p>}
    {cancelMessage && <p role="status" className="mt-3 text-sm text-slate-700">{cancelMessage}</p>}
    {request.driver && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Ambulance className="h-4 w-4 text-sky-700" />{request.driver.name || 'Assigned driver'}{request.driver.vehicleNumber ? ` · ${request.driver.vehicleNumber}` : ''}</p>{request.driver.phone && <a href={`tel:${request.driver.phone}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-sky-200 bg-white px-3 text-xs font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" />Call driver</a>}</div><p className="mt-2 text-xs text-slate-600">{request.estimatedEtaMinutes != null ? `Estimated arrival · ${request.estimatedEtaMinutes} min` : 'Arrival estimate unavailable'}{request.distanceKm != null ? ` · ${request.distanceKm} km to pickup` : ''}</p>{ageSeconds != null && <p className={`mt-1 text-xs ${locationStale ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>{locationStale ? 'Driver location is stale. ' : 'Driver location updated '}{ageSeconds === 0 ? 'just now' : `${ageSeconds}s ago`}{locationStale ? ` (last update ${ageSeconds}s ago)` : ''}</p>}{request.driver.accuracyM != null && request.driver.accuracyM > 100 && <p className="mt-1 text-xs text-amber-800">GPS accuracy is low (±{Math.round(request.driver.accuracyM)} m); the map marker may be imprecise.</p>}</div>}
    {request.status === 'accepted' && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><MapView height="250px" center={patientPoint} patientLocation={patientPoint} patientName="Pickup" driverLocation={driverPoint} hospitalLocation={hospitalPoint} showNetworkMarkers={false} />{driverPoint && <p className="bg-slate-50 px-3 py-2 text-xs text-slate-600">Route line may be approximate while live directions load.</p>}</div>}
    {request.destination?.name && <p className="mt-3 text-xs text-slate-600">Destination: <span className="font-semibold">{request.destination.name}</span>{request.destination.status ? ` · ${request.destination.status.replaceAll('_', ' ')}` : ''}</p>}
    {etaNotice && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{etaNotice}</p>}
    {error && <p role="status" className="mt-3 text-sm text-amber-800">Live updates are temporarily unavailable. {error}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" />Updated {new Date(request.serverTime).toLocaleTimeString()}</p><div className="flex gap-2"><button type="button" onClick={() => { setEtaNotice(''); void refresh(); }} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">Refresh</button>{canCancel && <button type="button" disabled={cancelling} onClick={() => void cancel()} className="min-h-10 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-800 disabled:opacity-50">{cancelling ? 'Cancelling…' : 'Cancel request'}</button>}</div></div>
  </section>;
};
