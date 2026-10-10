'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Check, MapPin, Phone, Radio, RefreshCw, Siren, X, Clock, AlertTriangle } from '@/components/icons';

type Coordinates = { latitude: number; longitude: number };
type LiveSOS = {
  id: string;
  incidentType: string;
  patientName: string;
  patientPhone?: string;
  location: Coordinates;
  requiredEquipment: string[];
  createdAt: string;
  assignmentExpiresAt?: string;
  distanceKm: number | null;
  priority?: string;
};
type ActiveSOS = Omit<LiveSOS, 'createdAt' | 'distanceKm'> & { distanceKm?: number | null; estimatedEtaMinutes?: number; acceptedAt?: string; arrivedAt?: string | null; directionsUrl: string; driverLocation?: Coordinates; tripStage: string; tripTimestamps?: Record<string, string>; destination?: { id: string; name: string; bedCategory?: string; status: string; rejectionReason?: string; location?: Coordinates } | null; vitalsUpdate?: { bp: string; heartRate: number; spO2: number; updatedAt: string } | null; issue?: { message: string; updatedAt: string; etaDelayMinutes?: number } | null };
type DriverInfo = { name?: string; ambulanceId?: string | null };
type PastTrip = { id: string; patientName: string; incidentType: string; createdAt: string; acceptedAt?: string; completedAt?: string; handoverAt?: string; tripStage?: string };

const getDriverLocation = () => new Promise<Coordinates>((resolve, reject) => {
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
  if (result.error === 'FORBIDDEN') return 'This workspace requires a driver account. Sign in with your driver account and retry.';
  if (result.error === 'UNAUTHENTICATED') return 'Your session has ended. Sign in again to load driver requests.';
  return result.error || result.message || fallback;
}

export function LiveSOSRequests({ onShowOnMap }: { onShowOnMap: (patient: [number, number], driver?: [number, number], hospital?: [number, number]) => void }) {
  const [requests, setRequests] = useState<LiveSOS[]>([]);
  const [activeRequest, setActiveRequest] = useState<ActiveSOS | null>(null);
  const [driverLocation, setDriverLocation] = useState<Coordinates | undefined>();
  const [alertRequest, setAlertRequest] = useState<LiveSOS | null>(null);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [driver, setDriver] = useState<DriverInfo>({});
  const [availableSince, setAvailableSince] = useState<string | null>(null);
  const [vitals, setVitals] = useState({ bp: '', heartRate: '', spO2: '' });
  const [issueText, setIssueText] = useState('');
  const [issueDelay, setIssueDelay] = useState('0');
  const [clockNow, setClockNow] = useState(0);
  const [view, setView] = useState<'dashboard' | 'history'>('dashboard');
  const [tripHistory, setTripHistory] = useState<PastTrip[]>([]);
  const [demoTripStep, setDemoTripStep] = useState(0);
  const [demoUpdatedAt, setDemoUpdatedAt] = useState<string | null>(null);
  const rerouteAttempted = useRef<string | null>(null);
  const seenRequestIds = useRef(new Set<string>());
  const seenOfferIds = useRef(new Set<string>());
  const hasLoadedOnce = useRef(false);
  const mappedActiveRequestId = useRef<string | null>(null);
  const mapCallback = useRef(onShowOnMap);
  const priorityOf = (request: LiveSOS) => request.priority || (/cardiac|respir|stroke|unconscious|trauma|critical/i.test(`${request.incidentType} ${request.requiredEquipment.join(' ')}`) ? 'Critical' : 'Urgent');
  const visibleRequests = [...requests].sort((a, b) => (priorityOf(a) === 'Critical' ? 0 : 1) - (priorityOf(b) === 'Critical' ? 0 : 1) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sos/available', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not load live SOS requests.'));
      setLoadError(false);
      setRequests(result.requests ?? []);
      setActiveRequest(result.activeRequest ?? null);
      setAvailable(Boolean(result.available));
      setDriver(result.driver ?? {});
      setAvailableSince(result.availableSince ?? null);
      setDriverLocation(result.driverLocation ?? result.activeRequest?.driverLocation);
      if (result.activeRequest?.id && mappedActiveRequestId.current !== result.activeRequest.id) {
        const patient = result.activeRequest.location as Coordinates;
        const driver = result.activeRequest.driverLocation as Coordinates | null;
        const hospital = result.activeRequest.destination?.location as Coordinates | undefined;
        onShowOnMap([patient.latitude, patient.longitude], driver ? [driver.latitude, driver.longitude] : undefined, hospital ? [hospital.latitude, hospital.longitude] : undefined);
        mappedActiveRequestId.current = result.activeRequest.id;
      } else if (result.activeRequest?.id && result.activeRequest.destination?.location) {
        const patient = result.activeRequest.location as Coordinates;
        const currentDriver = result.activeRequest.driverLocation as Coordinates | null;
        const hospital = result.activeRequest.destination.location as Coordinates;
        onShowOnMap([patient.latitude, patient.longitude], currentDriver ? [currentDriver.latitude, currentDriver.longitude] : undefined, [hospital.latitude, hospital.longitude]);
      } else if (!result.activeRequest) {
        mappedActiveRequestId.current = null;
      }
      const freshRequests = result.requests as LiveSOS[];
      if (hasLoadedOnce.current) {
        const unseen = freshRequests.filter((request) => !seenRequestIds.current.has(request.id)).sort((a, b) => (priorityOf(a) === 'Critical' ? 0 : 1) - (priorityOf(b) === 'Critical' ? 0 : 1))[0];
        const offered = freshRequests.find((request) => request.assignmentExpiresAt && !seenOfferIds.current.has(request.id));
        if ((offered || unseen) && !result.activeRequest) setAlertRequest((current) => current ?? offered ?? unseen ?? null);
      }
      for (const request of freshRequests) { seenRequestIds.current.add(request.id); if (request.assignmentExpiresAt) seenOfferIds.current.add(request.id); else seenOfferIds.current.delete(request.id); }
      hasLoadedOnce.current = true;
    } catch {
      setLoadError(true);
      setMessage('Couldn’t load requests. Retry.');
    } finally {
      setLoading(false);
    }
  }, [onShowOnMap]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    const initial = window.setTimeout(() => setClockNow(Date.now()), 0);
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!alertRequest) return;
    if ('vibrate' in navigator) navigator.vibrate?.([180, 80, 180]);
    try { const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = 880; gain.gain.value = 0.06; oscillator.start(); oscillator.stop(audio.currentTime + 0.18); oscillator.onended = () => void audio.close(); } catch { /* Sound is optional when the device blocks audio. */ }
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
      setAvailableSince(result.availableSince ?? (result.available ? new Date().toISOString() : null));
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

  const reject = async (id: string) => {
    setBusy(true);
    setMessage('');
    try {
      const reason = window.prompt('Why are you passing on this request? A reason is required.')?.trim() || '';
      if (!reason) { setMessage('Add a short reason before passing on this assignment.'); setBusy(false); return; }
      const response = await fetch(`/api/sos/${encodeURIComponent(id)}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not pass on this request.'));
      setMessage(result.message || 'Request passed on.');
      setAlertRequest((current) => current?.id === id ? null : current);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not pass on this request.');
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

  const sendTripUpdate = async (payload: { stage?: string; vitals?: { bp: string; heartRate: number; spO2: number }; issue?: string; etaDelayMinutes?: number }) => {
    if (!activeRequest) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sos/${encodeURIComponent(activeRequest.id)}/trip`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not update this trip.'));
      if (payload.vitals) setVitals({ bp: '', heartRate: '', spO2: '' });
      if (payload.issue) { setIssueText(''); setIssueDelay('0'); }
      await refresh();
      setMessage(result.message || 'Trip information shared with the hospital and dispatch team.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update this trip.'); }
    finally { setBusy(false); }
  };

  const reroute = async (requestId: string, automatic = false) => {
    if (!automatic) setBusy(true);
    setMessage(automatic ? 'Hospital could not confirm. Finding the next available destination…' : 'Finding the next available destination…');
    try {
      const response = await fetch(`/api/sos/${encodeURIComponent(requestId)}/reroute`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not reroute this trip.'));
      await refresh();
      setMessage(result.message || 'This trip has a new hospital destination.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not reroute this trip.');
    } finally { if (!automatic) setBusy(false); }
  };

  useEffect(() => {
    if (activeRequest?.destination?.status !== 'rejected') return;
    const key = `${activeRequest.id}:${activeRequest.destination.id}`;
    if (rerouteAttempted.current === key) return;
    rerouteAttempted.current = key;
    void reroute(activeRequest.id, true);
  // Reroute once for each rejected hospital destination, including timed-out requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRequest?.id, activeRequest?.destination?.id, activeRequest?.destination?.status]);

  const tripSteps = [
    ['accepted', 'Accepted'], ['arrived_patient', 'Arrived at patient'], ['patient_on_board', 'Patient on board'],
    ['en_route_hospital', 'En route to hospital'], ['arrived_hospital', 'Arrived at hospital'], ['handover_complete', 'Handover complete'],
  ];
  const currentStep = activeRequest ? Math.max(0, tripSteps.findIndex(([stage]) => stage === activeRequest.tripStage)) : 0;
  const nextStep = tripSteps[currentStep + 1];
  const demoSteps = ['Accepted', 'Arrived at patient', 'Patient on board', 'En route to hospital', 'Arrived at hospital', 'Handover complete'];

  useEffect(() => { mapCallback.current = onShowOnMap; }, [onShowOnMap]);
  const activeRequestId = activeRequest?.id;
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || activeRequestId) return;
    mapCallback.current([28.6328, 77.2195], [28.6352, 77.2168], [28.618, 77.212]);
  }, [activeRequestId]);

  const showHistory = async () => {
    setView('history');
    try {
      const response = await fetch('/api/sos/history', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load trip history.');
      setTripHistory(result.trips ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load trip history.'); }
  };

  return <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
    <nav className="mb-4 flex gap-2" aria-label="Driver dashboard sections"><button onClick={() => setView('dashboard')} className={`rounded-lg px-3 py-2 text-xs font-bold ${view === 'dashboard' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>Dashboard</button><button onClick={() => void showHistory()} className={`rounded-lg px-3 py-2 text-xs font-bold ${view === 'history' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>Trip history</button></nav>
    {view === 'history' ? <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold">Completed trips</h2>{tripHistory.length ? <div className="mt-3 divide-y divide-slate-100">{tripHistory.map((trip) => <article key={trip.id} className="flex flex-wrap justify-between gap-3 py-3"><div><p className="font-semibold">{trip.patientName} · {trip.incidentType}</p><p className="mt-1 text-xs text-slate-500">Case {trip.id.slice(0, 8)} · Requested {new Date(trip.createdAt).toLocaleString()}</p></div><div className="text-right text-xs text-slate-500"><p>Accepted {trip.acceptedAt ? new Date(trip.acceptedAt).toLocaleTimeString() : '—'}</p><p>Handover {trip.handoverAt ? new Date(trip.handoverAt).toLocaleTimeString() : '—'} · Completed {trip.completedAt ? new Date(trip.completedAt).toLocaleTimeString() : '—'}</p></div></article>)}</div> : <p className="py-8 text-center text-sm text-slate-500">No completed trips yet.</p>}</section> : <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">Live SOS requests</h2><p className="text-xs text-slate-500">New patient requests refresh automatically.</p></div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${activeRequest ? 'bg-amber-100 text-amber-800' : available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{activeRequest ? 'On trip / Busy' : available ? 'Available' : 'Offline'}</span>
        <button type="button" disabled={busy || loading || Boolean(activeRequest)} onClick={() => available ? void goOffline() : void goAvailable()} className="min-h-11 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60">
          {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}{available ? 'Go offline' : 'Go available'}
        </button>
      </div>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span>{driver.name || 'Driver'} · {driver.ambulanceId || 'Ambulance not linked'}</span>{availableSince && available && <span>Available since {new Date(availableSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</div>
    {message && <div role={loadError ? 'alert' : 'status'} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900"><span>{message}</span>{loadError && <button type="button" onClick={() => void refresh()} className="min-h-10 rounded-lg bg-sky-700 px-4 font-bold text-white">Retry</button>}</div>}
    {view === 'dashboard' && process.env.NODE_ENV === 'development' && !activeRequest && <article className="mb-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-sky-800">Simulated active assignment · Demo only</p><p className="mt-1 text-lg font-bold text-slate-900">Priya Mehra · 29 · Female</p><p className="mt-1 text-sm text-slate-700">Case P-1024 · Severe respiratory distress · <b className="text-rose-700">Critical</b></p><p className="mt-1 text-xs text-slate-600">Pickup: 12A Connaught Place, New Delhi · Landmark: near Central Park gate</p><p className="mt-1 text-xs text-slate-600">Patient: <a className="font-semibold text-sky-800" href="tel:+919876500124">+91 98765 00124</a> · Emergency contact: <a className="font-semibold text-sky-800" href="tel:+919876500129">+91 98765 00129</a></p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{demoSteps[demoTripStep]}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Emergency details</h3><p className="mt-1 text-xs text-slate-600">Raised 2:14 PM · Accepted 2:16 PM · Dispatch note: administer oxygen, prepare for rapid transfer.</p><p className="mt-1 text-xs text-slate-600">Needs: ICU bed · oxygen · ventilator ready · respiratory specialist</p><p className="mt-1 text-xs text-slate-600">Known allergy: penicillin · Condition: asthma · Medication: salbutamol inhaler</p></div><div className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Destination and pre-brief</h3><p className="mt-1 text-sm font-semibold">City Care Hospital · 4.8 km · Estimated 12 min</p><p className="mt-1 text-xs font-bold text-amber-800">Hospital confirmation pending · ICU bed requested</p><p className="mt-1 text-xs text-slate-600">Bed hold expires in 12:40 after confirmation. Pre-brief: severe wheezing, oxygen started, monitor SpO₂.</p></div><div className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Latest vitals</h3><p className="mt-1 text-xs text-slate-700">BP 125/85 mmHg · HR 124 bpm · SpO₂ 88% · GCS 15 · Conscious, distressed</p><p className="mt-1 text-xs text-slate-500">Recorded 2:18 PM · SpO₂ down from 91% at 2:16 PM</p></div><div className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Handover checklist</h3><p className="mt-1 text-xs text-slate-600">Arrival at hospital · Details shared · Vitals sent · Bed confirmed</p>{demoUpdatedAt && <p className="mt-1 text-xs text-emerald-700">Demo trip updated at {demoUpdatedAt}</p>}</div></div><button type="button" onClick={() => { setDemoTripStep((step) => Math.min(step + 1, demoSteps.length - 1)); setDemoUpdatedAt(new Date().toLocaleTimeString()); }} disabled={demoTripStep >= demoSteps.length - 1} className="mt-3 min-h-11 w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{demoTripStep >= demoSteps.length - 1 ? 'Demo handover complete' : `Demo: ${demoSteps[demoTripStep + 1]} · Update step`}</button><p className="mt-2 text-center text-[11px] text-slate-500">This sample demonstrates the assignment layout; advancing it does not change a real patient record.</p></article>}
    {activeRequest && <article className="mb-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-sky-800">Accepted assignment · {activeRequest.id.slice(0, 8)}</p><p className="mt-1 text-lg font-bold text-slate-900">{activeRequest.patientName}</p><p className="mt-1 text-sm text-slate-700">{activeRequest.incidentType} · {activeRequest.patientPhone || 'No phone provided'}</p><p className="mt-1 flex items-start gap-2 text-sm text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />Pickup {activeRequest.location.latitude.toFixed(5)}, {activeRequest.location.longitude.toFixed(5)}</p><p className="mt-1 text-xs text-slate-500">Ambulance {driver.ambulanceId || 'not linked'} · {activeRequest.distanceKm != null ? `${activeRequest.distanceKm} km from pickup` : 'Pickup distance unavailable'}{activeRequest.estimatedEtaMinutes != null ? ` · estimated ETA ${activeRequest.estimatedEtaMinutes} min` : ''}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">On trip / Busy</span></div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold text-slate-900">Hospital destination and bed confirmation</h3>{activeRequest.destination ? <><p className="mt-1 font-semibold text-slate-800">{activeRequest.destination.name} · {activeRequest.destination.bedCategory?.replace('_', ' ') || 'Resource requested'}</p><p className={`mt-1 text-xs font-bold ${activeRequest.destination.status === 'accepted' ? 'text-emerald-700' : activeRequest.destination.status === 'rejected' ? 'text-rose-700' : 'text-amber-700'}`}>{activeRequest.destination.status === 'accepted' ? 'Accepted · bed reserved' : activeRequest.destination.status === 'rejected' ? `Rejected · ${activeRequest.destination.rejectionReason?.replaceAll('_', ' ') || 'reason provided'}` : 'Pending hospital confirmation'}</p>{activeRequest.destination.status === 'rejected' && <><p className="mt-1 text-xs text-slate-600">Hospital could not confirm. A reroute was attempted automatically.</p><button type="button" disabled={busy} onClick={() => void reroute(activeRequest.id)} className="mt-2 min-h-10 rounded-lg border border-sky-200 px-3 text-sm font-semibold text-sky-800 disabled:opacity-50">Retry reroute</button></>}</> : <p className="mt-1 text-sm text-slate-500">Hospital destination is being confirmed.</p>}{activeRequest.estimatedEtaMinutes != null && <p className="mt-2 text-xs text-slate-600">Estimated ETA · {activeRequest.estimatedEtaMinutes} min</p>}</div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{tripSteps.map(([stage, label], index) => <div key={stage} className={`rounded-lg border px-2.5 py-2 text-xs ${index <= currentStep ? 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>{index + 1}. {label}{activeRequest.tripTimestamps?.[stage] && <span className="mt-1 block text-[10px] font-normal">{new Date(activeRequest.tripTimestamps[stage]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</div>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-4"><span>{currentStep >= 0 ? '✓' : '○'} Patient details shared</span><span>{activeRequest.vitalsUpdate ? '✓' : '○'} Vitals sent</span><span>{currentStep >= 4 ? '✓' : '○'} Arrived at hospital</span><span>{currentStep >= 5 ? '✓' : '○'} Handover complete</span></div>
      {nextStep && <button type="button" disabled={busy} onClick={() => void sendTripUpdate({ stage: nextStep[0] })} className="fixed inset-x-3 bottom-3 z-[60] min-h-14 rounded-xl bg-sky-700 px-5 py-3 text-base font-bold text-white shadow-xl hover:bg-sky-800 disabled:opacity-60 sm:static sm:mt-4 sm:w-full">{busy ? 'Updating trip…' : `Next step: ${nextStep[1]}`}</button>}
      {activeRequest.destination?.location && <a href={activeRequest.directionsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-800">Open navigation</a>}
      <div className="mt-4 grid gap-3 border-t border-sky-100 pt-4 md:grid-cols-2"><form onSubmit={(event) => { event.preventDefault(); void sendTripUpdate({ vitals: { bp: vitals.bp, heartRate: Number(vitals.heartRate), spO2: Number(vitals.spO2) } }); }} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Paramedic vitals update</h3><div className="grid grid-cols-3 gap-2"><input aria-label="Blood pressure" placeholder="BP 120/80" value={vitals.bp} onChange={(event) => setVitals((old) => ({ ...old, bp: event.target.value }))} className="min-w-0 rounded-md border border-slate-200 px-2 py-2 text-sm" /><input aria-label="Heart rate" inputMode="numeric" placeholder="HR bpm" value={vitals.heartRate} onChange={(event) => setVitals((old) => ({ ...old, heartRate: event.target.value }))} className="min-w-0 rounded-md border border-slate-200 px-2 py-2 text-sm" /><input aria-label="SpO₂" inputMode="numeric" placeholder="SpO₂ %" value={vitals.spO2} onChange={(event) => setVitals((old) => ({ ...old, spO2: event.target.value }))} className="min-w-0 rounded-md border border-slate-200 px-2 py-2 text-sm" /></div><button type="submit" disabled={busy || !vitals.bp || !vitals.heartRate || !vitals.spO2} className="min-h-10 w-full rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white disabled:opacity-50">Send update to hospital</button>{activeRequest.vitalsUpdate && <p className="text-xs text-emerald-700">Latest sent: BP {activeRequest.vitalsUpdate.bp}, HR {activeRequest.vitalsUpdate.heartRate}, SpO₂ {activeRequest.vitalsUpdate.spO2}%</p>}</form><form onSubmit={(event) => { event.preventDefault(); void sendTripUpdate({ issue: issueText, etaDelayMinutes: Number(issueDelay) }); }} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Report an issue</h3><textarea aria-label="Issue or delay" value={issueText} onChange={(event) => setIssueText(event.target.value)} placeholder="Traffic delay, hospital unreachable…" className="min-h-20 w-full rounded-md border border-slate-200 p-2 text-sm" /><label className="block text-xs text-slate-600">Additional ETA delay (minutes)<input type="number" min="0" max="240" value={issueDelay} onChange={(event) => setIssueDelay(event.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label><button type="submit" disabled={busy || issueText.trim().length < 3} className="min-h-10 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 disabled:opacity-50">Send issue to hospital</button>{activeRequest.issue && <p className="flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />{activeRequest.issue.message}{activeRequest.issue.etaDelayMinutes ? ` · ETA +${activeRequest.issue.etaDelayMinutes} min` : ''}</p>}</form></div>
    </article>}
    {loading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Checking for SOS requests…</p> : visibleRequests.length ? <div className="space-y-3"><h3 className="font-bold text-slate-900">Open SOS calls</h3>{visibleRequests.map((request) => <article key={request.id} className={`rounded-xl border p-4 ${priorityOf(request) === 'Critical' ? 'border-rose-300 bg-rose-50/80' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{request.incidentType}</p><p className="mt-1 text-sm text-slate-700">{request.patientName} · {request.patientPhone || 'No phone provided'}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5" />{request.distanceKm !== null ? `${request.distanceKm} km from you · est. ${Math.max(1, Math.ceil(request.distanceKm * 2.5))} min` : 'Distance and ETA unavailable'} · pickup GPS {request.location.latitude.toFixed(4)}, {request.location.longitude.toFixed(4)}</p>{request.requiredEquipment.length > 0 && <p className="mt-1 text-xs text-slate-600">Needs: {request.requiredEquipment.join(', ')}</p>}{request.assignmentExpiresAt ? <p className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-800"><Clock className="h-3.5 w-3.5" />Dispatcher offer · respond in {Math.max(0, Math.ceil((new Date(request.assignmentExpiresAt).getTime() - clockNow) / 1000))} sec</p> : <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" />Open call for nearby drivers</p>}</div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${priorityOf(request) === 'Critical' ? 'bg-rose-700 text-white' : 'bg-amber-100 text-amber-900'}`}>{priorityOf(request)} priority</span></div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void showOnMap(request)} className="flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-900"><MapPin className="h-3.5 w-3.5" />View on map</button><button type="button" disabled={busy || Boolean(activeRequest)} onClick={() => void accept(request.id)} className="flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Accept call</button><button type="button" disabled={busy} onClick={() => void reject(request.id)} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><X className="h-4 w-4" />Pass on</button>{request.patientPhone && <a href={`tel:${request.patientPhone}`} className="flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-900"><Phone className="h-3.5 w-3.5" />Call patient</a>}</div>
    </article>)}</div> : <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><Activity className="h-4 w-4" />{activeRequest ? 'You are on an assignment. New SOS calls are hidden while you are busy.' : 'No open SOS requests. New calls will appear here and trigger an alert.'}</p>}
    {!available && requests.length > 0 && <p className="mt-3 text-xs text-slate-500">Accept a call to go available using your current GPS location.</p>}
    {alertRequest && <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby="live-sos-alert-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl"><header className="flex items-start justify-between bg-rose-700 px-5 py-4 text-white"><div className="flex items-center gap-3"><Siren className="h-6 w-6 animate-pulse" /><div><p className="text-xs font-bold uppercase tracking-widest text-rose-100">New emergency · closes in 10 seconds</p><h2 id="live-sos-alert-title" className="mt-1 text-lg font-black">SOS request received</h2></div></div><button type="button" onClick={() => setAlertRequest(null)} aria-label="Dismiss SOS alert" className="rounded-lg p-1.5 hover:bg-white/15"><X className="h-5 w-5" /></button></header><div className="space-y-2 p-5"><p className="font-bold text-slate-900">{alertRequest.patientName} · {alertRequest.incidentType}</p><p className="text-sm text-slate-600">{alertRequest.patientPhone || 'No phone provided'}</p><p className="flex items-center gap-1 text-sm text-rose-800"><MapPin className="h-4 w-4" />GPS {alertRequest.location.latitude.toFixed(5)}, {alertRequest.location.longitude.toFixed(5)}</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => { void showOnMap(alertRequest); setAlertRequest(null); }} className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">View locations</button><button type="button" disabled={busy || Boolean(activeRequest)} onClick={() => void accept(alertRequest.id)} className="flex-1 rounded-lg bg-rose-700 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">Accept call</button></div></div></section></div>}
    </>}
  </section>;
}
