'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Check, MapPin, Phone, Radio, RefreshCw, Siren, X } from 'lucide-react';

type Coordinates = { latitude: number; longitude: number };
type LiveSOS = {
  id: string;
  incidentType: string;
  patientName: string;
  patientPhone?: string;
  location: Coordinates;
  requiredEquipment: string[];
  createdAt: string;
  distanceKm: number | null;
};
export type ActiveSOS = Omit<LiveSOS, 'createdAt' | 'distanceKm'> & { acceptedAt?: string; arrivedAt?: string | null; directionsUrl: string; driverLocation?: Coordinates };
type RecommendedHospital = {
  id: string;
  name: string;
  address?: string | { street?: string; city?: string; state?: string } | null;
  distanceKm: number;
  directionsUrl: string;
};

const getDriverLocation = () => new Promise<Coordinates>((resolve, reject) => {
  if (process.env.NODE_ENV === 'development') {
    resolve({ latitude: 28.6352, longitude: 77.2168 });
    return;
  }
  if (!navigator.geolocation) {
    reject(new Error('This browser cannot access GPS location.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
    reject,
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  );
});

function readError(result: { error?: string; message?: string }, fallback: string) {
  return result.error || result.message || fallback;
}

export function LiveSOSRequests({ onShowOnMap, onActiveAssignmentChange }: {
  onShowOnMap: (patient: [number, number], driver?: [number, number]) => void;
  onActiveAssignmentChange?: (assignment: ActiveSOS | null) => void;
}) {
  const [requests, setRequests] = useState<LiveSOS[]>([]);
  const [activeRequest, setActiveRequest] = useState<ActiveSOS | null>(null);
  const [arrivedRequestId, setArrivedRequestId] = useState<string | null>(null);
  const [nearbyHospitals, setNearbyHospitals] = useState<RecommendedHospital[]>([]);
  const [findingHospitals, setFindingHospitals] = useState(false);
  const [driverLocation, setDriverLocation] = useState<Coordinates | undefined>();
  const [alertRequest, setAlertRequest] = useState<LiveSOS | null>(null);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const seenRequestIds = useRef(new Set<string>());
  const mappedActiveRequestId = useRef<string | null>(null);
  const hospitalRequestId = useRef<string | null>(null);

  const loadNearestHospitals = useCallback(async (requestId: string) => {
    setFindingHospitals(true);
    try {
      const response = await fetch(`/api/sos/${encodeURIComponent(requestId)}/hospitals`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not find nearby hospitals.'));
      setNearbyHospitals(result.hospitals ?? []);
      hospitalRequestId.current = requestId;
      if (!result.hospitals?.length) setMessage(result.message || 'No suitable nearby hospitals were found.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not find nearby hospitals.');
    } finally {
      setFindingHospitals(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sos/available', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not load live SOS requests.'));
      setRequests(result.requests ?? []);
      setActiveRequest(result.activeRequest ?? null);
      onActiveAssignmentChange?.(result.activeRequest ?? null);
      setAvailable(Boolean(result.available));
      setDriverLocation(result.driverLocation ?? result.activeRequest?.driverLocation);
      if (result.activeRequest?.arrivedAt) {
        setArrivedRequestId(result.activeRequest.id);
        if (hospitalRequestId.current !== result.activeRequest.id) void loadNearestHospitals(result.activeRequest.id);
      } else if (!result.activeRequest) {
        setArrivedRequestId(null);
        setNearbyHospitals([]);
        hospitalRequestId.current = null;
      }
      if (result.activeRequest?.id && mappedActiveRequestId.current !== result.activeRequest.id) {
        const patient = result.activeRequest.location as Coordinates;
        const driver = result.activeRequest.driverLocation as Coordinates | null;
        onShowOnMap([patient.latitude, patient.longitude], driver ? [driver.latitude, driver.longitude] : undefined);
        mappedActiveRequestId.current = result.activeRequest.id;
      } else if (!result.activeRequest) {
        mappedActiveRequestId.current = null;
      }
      const unseen = (result.requests as LiveSOS[]).find((request) => !seenRequestIds.current.has(request.id));
      for (const request of result.requests as LiveSOS[]) seenRequestIds.current.add(request.id);
      if (unseen && !result.activeRequest) setAlertRequest((current) => current ?? unseen);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load live SOS requests.');
    } finally {
      setLoading(false);
    }
  }, [loadNearestHospitals, onActiveAssignmentChange, onShowOnMap]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!alertRequest) return;
    const timer = window.setTimeout(() => setAlertRequest(null), 10000);
    return () => window.clearTimeout(timer);
  }, [alertRequest]);

  const setAvailability = async (nextAvailable: boolean, location?: Coordinates) => {
      const response = await fetch('/api/sos/available', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: nextAvailable, ...(location ? { location } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not update your availability.'));
      setAvailable(result.available);
      if (location) setDriverLocation(location);
      await refresh();
  };

  const goAvailable = async () => {
    setBusy(true);
    setMessage(process.env.NODE_ENV === 'development' ? 'Setting your demo driver location near Connaught Place…' : 'Getting your location to go available…');
    try {
      const location = await getDriverLocation();
      await setAvailability(true, location);
      setMessage(process.env.NODE_ENV === 'development'
        ? 'You are available near Connaught Place and will receive new SOS requests.'
        : 'You are available and will receive new SOS requests.');
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const locationError = error as GeolocationPositionError;
        setMessage(locationError.code === locationError.PERMISSION_DENIED ? 'Allow location access to go available for SOS calls.' : 'Could not get your location. Please try again.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Could not go available.');
      }
    } finally {
      setBusy(false);
    }
  };

  const goOffline = async () => {
    setBusy(true);
    setMessage('');
    try {
      await setAvailability(false);
      setMessage('You are offline and will not receive new assignments.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not go offline.');
    } finally {
      setBusy(false);
    }
  };

  const accept = async (id: string) => {
    setBusy(true);
    setMessage('');
    try {
      const location = await getDriverLocation();
      if (!available) await setAvailability(true, location);
      const response = await fetch(`/api/sos/${encodeURIComponent(id)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not accept this request.'));
      setMessage('Emergency accepted. Patient details are now in your active assignment.');
      setAlertRequest(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not accept this request.');
    } finally {
      setBusy(false);
    }
  };

  const showOnMap = async (request: LiveSOS) => {
    let driver = driverLocation;
    if (!driver) {
      try { driver = await getDriverLocation(); } catch { /* Patient marker is still useful without driver location. */ }
    }
    onShowOnMap(
      [request.location.latitude, request.location.longitude],
      driver ? [driver.latitude, driver.longitude] : undefined,
    );
  };

  const markReachedPatient = async () => {
    if (!activeRequest) return;
    setBusy(true);
    setMessage('Recording arrival and finding the nearest hospital…');
    try {
      const response = await fetch(`/api/sos/${encodeURIComponent(activeRequest.id)}/arrive`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not record your arrival.'));
      setArrivedRequestId(activeRequest.id);
      setActiveRequest((current) => current ? { ...current, arrivedAt: result.request.arrivedAt } : current);
      setMessage('Arrival recorded. Nearby hospitals are listed below.');
      await loadNearestHospitals(activeRequest.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not record your arrival.');
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!activeRequest) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sos/${encodeURIComponent(activeRequest.id)}/complete`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not complete this request.'));
      setMessage('Emergency marked complete. You are available for the next request.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not complete this request.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">Live SOS requests</h2><p className="text-xs text-slate-500">New patient requests refresh automatically.</p></div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${activeRequest ? 'bg-amber-100 text-amber-800' : available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{activeRequest ? 'On call' : available ? 'Available' : 'Offline'}</span>
        <button type="button" disabled={busy || loading || Boolean(activeRequest)} onClick={() => available ? void goOffline() : void goAvailable()} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60">
          {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}{available ? 'Go offline' : 'Go available'}
        </button>
      </div>
    </div>
    {message && <p role="status" className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900">{message}</p>}
    {activeRequest && <article className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Accepted emergency · {activeRequest.id.slice(0, 8)}</p><p className="mt-1 font-bold text-slate-900">{activeRequest.patientName} · {activeRequest.incidentType}</p><p className="mt-1 text-xs text-slate-600">{activeRequest.patientPhone || 'No phone provided'} · Pickup {activeRequest.location.latitude.toFixed(5)}, {activeRequest.location.longitude.toFixed(5)}</p></div><button type="button" onClick={() => onShowOnMap([activeRequest.location.latitude, activeRequest.location.longitude], driverLocation ? [driverLocation.latitude, driverLocation.longitude] : undefined)} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900">Show route on map</button></div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={busy || findingHospitals} onClick={() => void markReachedPatient()} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{findingHospitals ? 'Finding hospitals…' : arrivedRequestId === activeRequest.id ? 'Reached patient' : 'Reached patient · Find nearest hospital'}</button>{arrivedRequestId === activeRequest.id && <span className="text-xs font-semibold text-emerald-800">Arrival recorded</span>}</div>
      {arrivedRequestId === activeRequest.id && <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3"><h3 className="text-sm font-bold text-slate-900">Nearest suitable hospitals</h3>{findingHospitals ? <p className="mt-2 text-xs text-slate-500">Searching nearby hospital data…</p> : nearbyHospitals.length ? <ul className="mt-2 space-y-2">{nearbyHospitals.map((hospital) => { const address = typeof hospital.address === 'string' ? hospital.address : [hospital.address?.street, hospital.address?.city, hospital.address?.state].filter(Boolean).join(', '); return <li key={hospital.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"><div><p className="text-sm font-semibold text-slate-900">{hospital.name}</p><p className="text-xs text-slate-500">{address || `${hospital.distanceKm} km away`}{address ? ` · ${hospital.distanceKm} km` : ''}</p></div><a href={hospital.directionsUrl} target="_blank" rel="noreferrer" className="rounded-md border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-800">Directions</a></li>; })}</ul> : <p className="mt-2 text-xs text-slate-500">No suitable nearby hospitals were found.</p>}</div>}
      <button type="button" disabled={busy} onClick={() => void complete()} className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60"><Check className="h-4 w-4" />Mark complete</button>
    </article>}
    {loading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Checking for SOS requests…</p> : requests.length ? <div className="space-y-3">{requests.map((request) => <article key={request.id} className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-rose-950">SOS · {request.incidentType}</p><p className="mt-1 text-sm text-rose-900">{request.patientName} · {request.patientPhone || 'No phone provided'}</p><p className="mt-1 flex items-center gap-1 text-xs text-rose-800"><MapPin className="h-3.5 w-3.5" />GPS {request.location.latitude.toFixed(5)}, {request.location.longitude.toFixed(5)}{request.distanceKm !== null ? ` · ${request.distanceKm} km away` : ''}</p>{request.requiredEquipment.length > 0 && <p className="mt-1 text-xs text-rose-800">Needs: {request.requiredEquipment.join(', ')}</p>}</div><span className="rounded-full bg-rose-700 px-2.5 py-1 text-[11px] font-bold uppercase text-white">Searching</span></div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void showOnMap(request)} className="flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-900"><MapPin className="h-3.5 w-3.5" />View on map</button><button type="button" disabled={busy || Boolean(activeRequest)} onClick={() => void accept(request.id)} className="flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Accept call</button>{request.patientPhone && <a href={`tel:${request.patientPhone}`} className="flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-900"><Phone className="h-3.5 w-3.5" />Call patient</a>}</div>
    </article>)}</div> : <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><Activity className="h-4 w-4" />No open SOS requests. This list updates automatically.</p>}
    {!available && requests.length > 0 && <p className="mt-3 text-xs text-slate-500">Accept a call to go available using your current GPS location.</p>}
    {alertRequest && <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby="live-sos-alert-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl"><header className="flex items-start justify-between bg-rose-700 px-5 py-4 text-white"><div className="flex items-center gap-3"><Siren className="h-6 w-6 animate-pulse" /><div><p className="text-xs font-bold uppercase tracking-widest text-rose-100">New emergency · closes in 10 seconds</p><h2 id="live-sos-alert-title" className="mt-1 text-lg font-black">SOS request received</h2></div></div><button type="button" onClick={() => setAlertRequest(null)} aria-label="Dismiss SOS alert" className="rounded-lg p-1.5 hover:bg-white/15"><X className="h-5 w-5" /></button></header><div className="space-y-2 p-5"><p className="font-bold text-slate-900">{alertRequest.patientName} · {alertRequest.incidentType}</p><p className="text-sm text-slate-600">{alertRequest.patientPhone || 'No phone provided'}</p><p className="flex items-center gap-1 text-sm text-rose-800"><MapPin className="h-4 w-4" />GPS {alertRequest.location.latitude.toFixed(5)}, {alertRequest.location.longitude.toFixed(5)}</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => { void showOnMap(alertRequest); setAlertRequest(null); }} className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">View locations</button><button type="button" disabled={busy || Boolean(activeRequest)} onClick={() => void accept(alertRequest.id)} className="flex-1 rounded-lg bg-rose-700 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">Accept call</button></div></div></section></div>}
  </section>;
}
