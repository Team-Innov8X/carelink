'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Check, MapPin, Phone, Radio, RefreshCw, Siren, Clock, AlertTriangle } from '@/components/icons';

type Coordinates = { latitude: number; longitude: number };
type LiveSOS = {
  id: string;
  type?: 'sos' | 'normal';
  incidentType: string;
  patientName: string;
  patientPhone?: string;
  location: Coordinates;
  requiredEquipment: string[];
  createdAt: string;
  assignmentExpiresAt?: string;
  distanceKm: number | null;
  priority?: string;
  urgency?: string;
  notes?: string;
  destination?: string;
};
type ActiveSOS = Omit<LiveSOS, 'createdAt' | 'distanceKm'> & { distanceKm?: number | null; estimatedEtaMinutes?: number; acceptedAt?: string; arrivedAt?: string | null; directionsUrl: string; driverLocation?: Coordinates; tripStage: string; tripTimestamps?: Record<string, string>; destination?: { id: string; name: string; bedCategory?: string; status: string; rejectionReason?: string; location?: Coordinates } | null; vitalsUpdate?: { bp: string; heartRate: number; spO2: number; updatedAt: string } | null; issue?: { message: string; updatedAt: string; etaDelayMinutes?: number } | null };
type DriverInfo = { name?: string; ambulanceId?: string | null };
type PastTrip = { id: string; patientName: string; incidentType: string; createdAt: string; acceptedAt?: string; completedAt?: string; cancelledAt?: string; handoverAt?: string; missedAt?: string; tripStage?: string; status?: string };
type DriverTab = 'overview' | 'requests' | 'current-trip' | 'history';

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

export function LiveSOSRequests({ onShowOnMap, onActiveSectionChange }: { onShowOnMap: (patient: [number, number], driver?: [number, number], hospital?: [number, number]) => void; onActiveSectionChange?: (section: DriverTab) => void }) {
  const [requests, setRequests] = useState<LiveSOS[]>([]);
  const [activeRequest, setActiveRequest] = useState<ActiveSOS | null>(null);
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
  const [view, setView] = useState<DriverTab>('overview');
  const [tripHistory, setTripHistory] = useState<PastTrip[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [pollSeconds, setPollSeconds] = useState(3);
  const [locationState, setLocationState] = useState<'off' | 'sharing' | 'unavailable'>('off');
  const [demoTripStep, setDemoTripStep] = useState(0);
  const [demoUpdatedAt, setDemoUpdatedAt] = useState<string | null>(null);
  const rerouteAttempted = useRef<string | null>(null);
  const seenRequestIds = useRef(new Set<string>());
  const seenOfferIds = useRef(new Set<string>());
  const mappedActiveRequestId = useRef<string | null>(null);
  const previousActiveRequestId = useRef<string | null>(null);
  const alertIdRef = useRef<string | null>(null);
  const priorityOf = (request: LiveSOS) => request.priority || (/cardiac|respir|stroke|unconscious|trauma|critical/i.test(`${request.incidentType} ${request.requiredEquipment.join(' ')}`) ? 'Critical' : 'Urgent');
  const visibleRequests = [...requests].filter((request) => request.type === 'normal').sort((a, b) => (a.urgency === 'critical' ? 0 : 1) - (b.urgency === 'critical' ? 0 : 1) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const visibleSosRequests = [...requests].filter((request) => request.type !== 'normal').sort((a, b) => (priorityOf(a) === 'Critical' ? 0 : 1) - (priorityOf(b) === 'Critical' ? 0 : 1) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const changeView = useCallback((nextView: DriverTab) => { setView(nextView); onActiveSectionChange?.(nextView); }, [onActiveSectionChange]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sos/available', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not load live SOS requests.'));
      if (result.serverTime) setServerOffsetMs(new Date(result.serverTime).getTime() - Date.now());
      if (Number.isFinite(result.pollSeconds) && result.pollSeconds > 0) setPollSeconds(result.pollSeconds);
      setLoadError(false);
      const freshRequests = (result.requests ?? []) as LiveSOS[];
      setRequests(freshRequests);
      const nextActive = result.activeRequest ?? null;
      setActiveRequest(nextActive);
      if (nextActive?.id && !previousActiveRequestId.current) changeView('current-trip');
      previousActiveRequestId.current = nextActive?.id ?? null;
      setAvailable(Boolean(result.available));
      setLocationState(result.available ? result.driverLocation ? 'sharing' : 'unavailable' : 'off');
      setDriver(result.driver ?? {});
      setAvailableSince(result.availableSince ?? null);
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
      const unseen = freshRequests.filter((request) => request.type !== 'normal' && !seenRequestIds.current.has(request.id)).sort((a, b) => (priorityOf(a) === 'Critical' ? 0 : 1) - (priorityOf(b) === 'Critical' ? 0 : 1))[0];
      const offered = freshRequests.find((request) => request.type !== 'normal' && request.assignmentExpiresAt && !seenOfferIds.current.has(request.id));
      const candidate = offered ?? unseen;
      if (candidate && !result.activeRequest) {
        const key = `carelink-sos-alert:${candidate.id}`;
        let alreadyClaimed = false;
        try {
          const claimedUntil = Number(localStorage.getItem(key) || 0);
          alreadyClaimed = claimedUntil > Date.now() + serverOffsetMs;
          if (!alreadyClaimed) localStorage.setItem(key, String(candidate.assignmentExpiresAt ? new Date(candidate.assignmentExpiresAt).getTime() : Date.now() + serverOffsetMs + 10000));
        } catch { /* Storage can be disabled; the server still prevents duplicate acceptance. */ }
        if (!alreadyClaimed) { alertIdRef.current = candidate.id; setAlertRequest((current) => current ?? candidate); }
      }
      const currentAlertId = alertIdRef.current;
      if (currentAlertId && !freshRequests.some((request) => request.id === currentAlertId && request.type !== 'normal')) {
        const expired = alertRequest?.id === currentAlertId && alertRequest.assignmentExpiresAt && new Date(alertRequest.assignmentExpiresAt).getTime() <= Date.now() + serverOffsetMs;
        alertIdRef.current = null;
        setAlertRequest(null);
        setMessage(expired ? 'SOS offer expired and was recorded in Task History as missed.' : 'This SOS was cancelled or accepted by another driver.');
      }
      for (const request of freshRequests) { seenRequestIds.current.add(request.id); if (request.assignmentExpiresAt) seenOfferIds.current.add(request.id); else seenOfferIds.current.delete(request.id); }
    } catch {
      setLoadError(true);
      setMessage('Couldn’t load requests. Retry.');
    } finally {
      setLoading(false);
    }
  }, [onShowOnMap, changeView, alertRequest, serverOffsetMs]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, pollSeconds * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh, pollSeconds]);

  useEffect(() => {
    if (!available) return;
    const heartbeat = async () => {
      try {
        const location = await getDriverLocation();
        const response = await fetch('/api/sos/available', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location }) });
        if (response.ok) setLocationState('sharing');
      } catch { setLocationState('unavailable'); }
    };
    const timer = window.setInterval(() => void heartbeat(), 10_000);
    return () => window.clearInterval(timer);
  }, [available]);

  useEffect(() => {
    const initial = window.setTimeout(() => setClockNow(Date.now()), 0);
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!alertRequest) return;
    if ('vibrate' in navigator) navigator.vibrate?.([180, 80, 180]);
    try { const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = 880; gain.gain.value = 0.06; oscillator.start(); oscillator.stop(audio.currentTime + 0.18); oscillator.onended = () => void audio.close(); } catch { /* Sound is optional when the device blocks audio. */ }
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
      if (location) setLocationState('sharing');
      else if (!result.available) setLocationState('off');
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
        setLocationState('unavailable');
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
      setMessage(requests.find((request) => request.id === id)?.type === 'normal' ? 'Transport request accepted. Patient details are now in your active assignment.' : 'Emergency accepted. Patient details are now in your active assignment.');
      alertIdRef.current = null;
      setAlertRequest(null);
      await refresh();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not accept this request.';
      setMessage(reason);
      if (reason.toLowerCase().includes('already been taken') || reason.toLowerCase().includes('expired')) setAlertRequest(null);
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
      alertIdRef.current = null;
      setAlertRequest((current) => current?.id === id ? null : current);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not pass on this request.');
    } finally {
      setBusy(false);
    }
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

  const showHistory = async () => {
    changeView('history');
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await fetch('/api/sos/history', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load trip history.');
      setTripHistory(result.trips ?? []);
    } catch (error) { setHistoryError(error instanceof Error ? error.message : 'Could not load trip history.'); }
    finally { setHistoryLoading(false); }
  };

  const remainingSeconds = alertRequest?.assignmentExpiresAt
    ? Math.max(0, Math.ceil((new Date(alertRequest.assignmentExpiresAt).getTime() - (clockNow + serverOffsetMs)) / 1000))
    : alertRequest ? Math.max(0, 10 - Math.floor((clockNow - new Date(alertRequest.createdAt).getTime()) / 1000)) : 0;
  const cancelTrip = async () => {
    if (!activeRequest) return;
    if (!window.confirm('Cancel this active trip? Dispatch and the patient will be notified.')) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(activeRequest.id)}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result, 'Could not cancel this trip.'));
      setMessage('Trip cancelled. Dispatch and the patient have been updated.');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not cancel this trip.'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (alertRequest && remainingSeconds === 0) {
      const timer = window.setTimeout(() => {
        alertIdRef.current = null;
        setAlertRequest(null);
        setMessage('SOS offer expired and was recorded in Task History as missed.');
        void refresh();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return;
  }, [alertRequest, remainingSeconds, refresh]);

  useEffect(() => {
    if (!alertRequest) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === `carelink-sos-alert:${alertRequest.id}` && event.newValue) {
        alertIdRef.current = null;
        setAlertRequest(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [alertRequest]);

  return <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Driver dashboard sections">{([['overview', 'Overview'], ['requests', 'Requests'], ['current-trip', 'Current Trip'], ['history', 'Task History']] as const).map(([tab, label]) => <button key={tab} onClick={() => tab === 'history' ? void showHistory() : changeView(tab)} aria-current={view === tab ? 'page' : undefined} className={`rounded-lg px-3 py-2 text-xs font-bold ${view === tab ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>{label}</button>)}</nav>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">Driver status</h2><p className="text-xs text-slate-500">Availability and location sharing</p></div>
      <div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${activeRequest ? 'bg-amber-100 text-amber-800' : available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{activeRequest ? 'On trip / Busy' : available ? 'Available' : 'Offline'}</span><button type="button" disabled={busy || loading || Boolean(activeRequest)} onClick={() => available ? void goOffline() : void goAvailable()} className="min-h-11 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60">{busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}{available ? 'Go offline' : 'Go available'}</button></div>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span>{driver.name || 'Driver'} · {driver.ambulanceId || 'Ambulance not linked'}</span><span className={locationState === 'sharing' ? 'text-emerald-700' : locationState === 'unavailable' ? 'text-amber-700' : ''}>Location {locationState === 'sharing' ? 'sharing' : locationState === 'unavailable' ? 'unavailable' : 'not shared'}</span>{availableSince && available && <span>Available since {new Date(availableSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</div>
    {view === 'history' ? <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold">Task history</h2>{historyLoading ? <p className="py-8 text-center text-sm text-slate-500">Loading task history…</p> : historyError ? <div role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{historyError}<button type="button" onClick={() => void showHistory()} className="ml-3 font-bold underline">Retry</button></div> : tripHistory.length ? <div className="mt-3 divide-y divide-slate-100">{tripHistory.map((trip) => <article key={trip.id} className="flex flex-wrap justify-between gap-3 py-3"><div><p className="font-semibold">{trip.patientName} · {trip.incidentType}</p><p className="mt-1 text-xs text-slate-500">Case {trip.id.slice(0, 8)} · Requested {new Date(trip.createdAt).toLocaleString()}</p></div><div className="text-right text-xs text-slate-500"><p className="font-bold capitalize">{trip.status || 'completed'}</p>{trip.status === 'missed' ? <p>Missed {trip.missedAt ? new Date(trip.missedAt).toLocaleString() : '—'}</p> : trip.status === 'cancelled' ? <p>Cancelled {trip.cancelledAt ? new Date(trip.cancelledAt).toLocaleString() : '—'}</p> : <><p>Accepted {trip.acceptedAt ? new Date(trip.acceptedAt).toLocaleTimeString() : '—'}</p><p>Handover {trip.handoverAt ? new Date(trip.handoverAt).toLocaleTimeString() : '—'} · Completed {trip.completedAt ? new Date(trip.completedAt).toLocaleTimeString() : '—'}</p></>}</div></article>)}</div> : <p className="py-8 text-center text-sm text-slate-500">No completed, cancelled, or missed tasks yet.</p>}</section> : <>
    {message && <div role={loadError ? 'alert' : 'status'} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900"><span>{message}</span>{loadError && <button type="button" onClick={() => void refresh()} className="min-h-10 rounded-lg bg-sky-700 px-4 font-bold text-white">Retry</button>}</div>}
    {view === 'overview' && process.env.NODE_ENV === 'development' && !activeRequest && <article className="mb-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-sky-800">Simulated active assignment · Demo only</p><p className="mt-1 text-lg font-bold text-slate-900">Priya Mehra · 29 · Female</p><p className="mt-1 text-sm text-slate-700">Case P-1024 · Severe respiratory distress · <b className="text-rose-700">Critical</b></p><p className="mt-1 text-xs text-slate-600">Pickup: 12A Connaught Place, New Delhi · Landmark: near Central Park gate</p><p className="mt-1 text-xs text-slate-600">Patient: <a className="font-semibold text-sky-800" href="tel:+919876500124">+91 98765 00124</a> · Emergency contact: <a className="font-semibold text-sky-800" href="tel:+919876500129">+91 98765 00129</a></p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{demoSteps[demoTripStep]}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Emergency details</h3><p className="mt-1 text-xs text-slate-600">Raised 2:14 PM · Accepted 2:16 PM · Dispatch note: administer oxygen, prepare for rapid transfer.</p><p className="mt-1 text-xs text-slate-600">Needs: ICU bed · oxygen · ventilator ready · respiratory specialist</p><p className="mt-1 text-xs text-slate-600">Known allergy: penicillin · Condition: asthma · Medication: salbutamol inhaler</p></div><div className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Destination and pre-brief</h3><p className="mt-1 text-sm font-semibold">City Care Hospital · 4.8 km · Estimated 12 min</p><p className="mt-1 text-xs font-bold text-amber-800">Hospital confirmation pending · ICU bed requested</p><p className="mt-1 text-xs text-slate-600">Bed hold expires in 12:40 after confirmation. Pre-brief: severe wheezing, oxygen started, monitor SpO₂.</p></div><div className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Latest vitals</h3><p className="mt-1 text-xs text-slate-700">BP 125/85 mmHg · HR 124 bpm · SpO₂ 88% · GCS 15 · Conscious, distressed</p><p className="mt-1 text-xs text-slate-500">Recorded 2:18 PM · SpO₂ down from 91% at 2:16 PM</p></div><div className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Handover checklist</h3><p className="mt-1 text-xs text-slate-600">Arrival at hospital · Details shared · Vitals sent · Bed confirmed</p>{demoUpdatedAt && <p className="mt-1 text-xs text-emerald-700">Demo trip updated at {demoUpdatedAt}</p>}</div></div><button type="button" onClick={() => { setDemoTripStep((step) => Math.min(step + 1, demoSteps.length - 1)); setDemoUpdatedAt(new Date().toLocaleTimeString()); }} disabled={demoTripStep >= demoSteps.length - 1} className="mt-3 min-h-11 w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{demoTripStep >= demoSteps.length - 1 ? 'Demo handover complete' : `Demo: ${demoSteps[demoTripStep + 1]} · Update step`}</button><p className="mt-2 text-center text-[11px] text-slate-500">This sample demonstrates the assignment layout; advancing it does not change a real patient record.</p></article>}
    {view === 'current-trip' && activeRequest && <article className="mb-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-sky-800">Accepted assignment · {activeRequest.id.slice(0, 8)}</p><p className="mt-1 text-lg font-bold text-slate-900">{activeRequest.patientName}</p><p className="mt-1 text-sm text-slate-700">{activeRequest.incidentType} · {activeRequest.patientPhone ? <a className="font-semibold text-sky-800" href={`tel:${activeRequest.patientPhone}`}><Phone className="mr-1 inline h-3.5 w-3.5" />{activeRequest.patientPhone}</a> : 'No phone provided'}</p><p className="mt-1 flex items-start gap-2 text-sm text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />Pickup {activeRequest.location.latitude.toFixed(5)}, {activeRequest.location.longitude.toFixed(5)}</p><p className="mt-1 text-xs text-slate-500">Ambulance {driver.ambulanceId || 'not linked'} · {activeRequest.distanceKm != null ? `${activeRequest.distanceKm} km from pickup` : 'Pickup distance unavailable'}{activeRequest.estimatedEtaMinutes != null ? ` · estimated ETA ${activeRequest.estimatedEtaMinutes} min` : ''}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">On trip / Busy</span></div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold text-slate-900">Hospital destination and bed confirmation</h3>{activeRequest.destination ? <><p className="mt-1 font-semibold text-slate-800">{activeRequest.destination.name} · {activeRequest.destination.bedCategory?.replace('_', ' ') || 'Resource requested'}</p><p className={`mt-1 text-xs font-bold ${activeRequest.destination.status === 'accepted' ? 'text-emerald-700' : activeRequest.destination.status === 'rejected' ? 'text-rose-700' : 'text-amber-700'}`}>{activeRequest.destination.status === 'accepted' ? 'Accepted · bed reserved' : activeRequest.destination.status === 'rejected' ? `Rejected · ${activeRequest.destination.rejectionReason?.replaceAll('_', ' ') || 'reason provided'}` : 'Pending hospital confirmation'}</p>{activeRequest.destination.status === 'rejected' && <><p className="mt-1 text-xs text-slate-600">Hospital could not confirm. A reroute was attempted automatically.</p><button type="button" disabled={busy} onClick={() => void reroute(activeRequest.id)} className="mt-2 min-h-10 rounded-lg border border-sky-200 px-3 text-sm font-semibold text-sky-800 disabled:opacity-50">Retry reroute</button></>}</> : <p className="mt-1 text-sm text-slate-500">Hospital destination is being confirmed.</p>}{activeRequest.estimatedEtaMinutes != null && <p className="mt-2 text-xs text-slate-600">Estimated ETA · {activeRequest.estimatedEtaMinutes} min</p>}</div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{tripSteps.map(([stage, label], index) => <div key={stage} className={`rounded-lg border px-2.5 py-2 text-xs ${index <= currentStep ? 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>{index + 1}. {label}{activeRequest.tripTimestamps?.[stage] && <span className="mt-1 block text-[10px] font-normal">{new Date(activeRequest.tripTimestamps[stage]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</div>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-4"><span>{currentStep >= 0 ? '✓' : '○'} Patient details shared</span><span>{activeRequest.vitalsUpdate ? '✓' : '○'} Vitals sent</span><span>{currentStep >= 4 ? '✓' : '○'} Arrived at hospital</span><span>{currentStep >= 5 ? '✓' : '○'} Handover complete</span></div>
      {nextStep && <button type="button" disabled={busy} onClick={() => void sendTripUpdate({ stage: nextStep[0] })} className="fixed inset-x-3 bottom-3 z-[60] min-h-14 rounded-xl bg-sky-700 px-5 py-3 text-base font-bold text-white shadow-xl hover:bg-sky-800 disabled:opacity-60 sm:static sm:mt-4 sm:w-full">{busy ? 'Updating trip…' : `Next step: ${nextStep[1]}`}</button>}
      {activeRequest.destination?.location && <a href={activeRequest.directionsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-800">Open navigation</a>}<button type="button" disabled={busy} onClick={() => void cancelTrip()} className="ml-2 mt-3 inline-flex min-h-11 items-center rounded-lg border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-800 disabled:opacity-50">Cancel trip</button>
      <div className="mt-4 grid gap-3 border-t border-sky-100 pt-4 md:grid-cols-2"><form onSubmit={(event) => { event.preventDefault(); void sendTripUpdate({ vitals: { bp: vitals.bp, heartRate: Number(vitals.heartRate), spO2: Number(vitals.spO2) } }); }} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Paramedic vitals update</h3><div className="grid grid-cols-3 gap-2"><input aria-label="Blood pressure" placeholder="BP 120/80" value={vitals.bp} onChange={(event) => setVitals((old) => ({ ...old, bp: event.target.value }))} className="min-w-0 rounded-md border border-slate-200 px-2 py-2 text-sm" /><input aria-label="Heart rate" inputMode="numeric" placeholder="HR bpm" value={vitals.heartRate} onChange={(event) => setVitals((old) => ({ ...old, heartRate: event.target.value }))} className="min-w-0 rounded-md border border-slate-200 px-2 py-2 text-sm" /><input aria-label="SpO₂" inputMode="numeric" placeholder="SpO₂ %" value={vitals.spO2} onChange={(event) => setVitals((old) => ({ ...old, spO2: event.target.value }))} className="min-w-0 rounded-md border border-slate-200 px-2 py-2 text-sm" /></div><button type="submit" disabled={busy || !vitals.bp || !vitals.heartRate || !vitals.spO2} className="min-h-10 w-full rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white disabled:opacity-50">Send update to hospital</button>{activeRequest.vitalsUpdate && <p className="text-xs text-emerald-700">Latest sent: BP {activeRequest.vitalsUpdate.bp}, HR {activeRequest.vitalsUpdate.heartRate}, SpO₂ {activeRequest.vitalsUpdate.spO2}%</p>}</form><form onSubmit={(event) => { event.preventDefault(); void sendTripUpdate({ issue: issueText, etaDelayMinutes: Number(issueDelay) }); }} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Report an issue</h3><textarea aria-label="Issue or delay" value={issueText} onChange={(event) => setIssueText(event.target.value)} placeholder="Traffic delay, hospital unreachable…" className="min-h-20 w-full rounded-md border border-slate-200 p-2 text-sm" /><label className="block text-xs text-slate-600">Additional ETA delay (minutes)<input type="number" min="0" max="240" value={issueDelay} onChange={(event) => setIssueDelay(event.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label><button type="submit" disabled={busy || issueText.trim().length < 3} className="min-h-10 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 disabled:opacity-50">Send issue to hospital</button>{activeRequest.issue && <p className="flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />{activeRequest.issue.message}{activeRequest.issue.etaDelayMinutes ? ` · ETA +${activeRequest.issue.etaDelayMinutes} min` : ''}</p>}</form></div>
    </article>}
    {view === 'current-trip' && !activeRequest && <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-6 text-sm text-slate-500"><Activity className="h-4 w-4" />No active trip. Accepted assignments will appear here automatically.</p>}
    {view === 'overview' && <section className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-bold text-slate-900">Emergency SOS offers</h3>{loading ? <p className="mt-2 text-sm text-slate-500">Checking for SOS offers…</p> : visibleSosRequests.length ? <div className="mt-3 space-y-3">{visibleSosRequests.map((request) => <article key={request.id} className={`rounded-xl border p-4 ${priorityOf(request) === 'Critical' ? 'border-rose-300 bg-rose-50/80' : 'border-slate-200 bg-white'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{request.incidentType} · {request.urgency || priorityOf(request)}</p><p className="mt-1 text-sm text-slate-700">{request.patientName}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5" />{request.distanceKm != null ? `${request.distanceKm} km away` : 'Distance unavailable'} · approximate area {request.location.latitude.toFixed(2)}, {request.location.longitude.toFixed(2)}</p>{request.assignmentExpiresAt && <p className="mt-1 text-xs font-bold text-amber-800">Offer expires in {Math.max(0, Math.ceil((new Date(request.assignmentExpiresAt).getTime() - (clockNow + serverOffsetMs)) / 1000))} sec</p>}</div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${priorityOf(request) === 'Critical' ? 'bg-rose-700 text-white' : 'bg-amber-100 text-amber-900'}`}>{priorityOf(request)} priority</span></div><div className="mt-3 flex gap-2"><button type="button" disabled={busy || Boolean(activeRequest)} onClick={() => void accept(request.id)} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Accept</button><button type="button" disabled={busy} onClick={() => void reject(request.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Decline</button></div></article>)}</div> : <p className="mt-2 text-sm text-slate-500">No emergency offers right now. New offers will appear here and trigger an alert.</p>}</section>}
    {view === 'requests' && (loading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Checking for transport requests…</p> : visibleRequests.length ? <div className="space-y-3"><h3 className="font-bold text-slate-900">Normal transport requests</h3>{visibleRequests.map((request) => <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{request.incidentType}</p><p className="mt-1 text-sm text-slate-700">Urgency: {request.urgency || 'Routine'}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5" />{request.distanceKm != null ? `${request.distanceKm} km away · est. ${Math.max(1, Math.ceil(request.distanceKm * 2.5))} min` : 'Distance and ETA unavailable'} · approximate area {request.location.latitude.toFixed(2)}, {request.location.longitude.toFixed(2)}</p><p className="mt-1 text-xs text-slate-600">Destination: {request.destination || 'To be confirmed'}</p>{request.notes && <p className="mt-2 text-sm text-slate-700">{request.notes}</p>}{request.assignmentExpiresAt && <p className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-800"><Clock className="h-3.5 w-3.5" />Offer expires in {Math.max(0, Math.ceil((new Date(request.assignmentExpiresAt).getTime() - (clockNow + serverOffsetMs)) / 1000))} sec</p>}</div><button type="button" disabled={busy || Boolean(activeRequest)} onClick={() => void accept(request.id)} className="flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />Accept request</button></div>
    </article>)}</div> : <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><Activity className="h-4 w-4" />No normal requests right now. New requests will appear here automatically.</p>)}
    {!available && requests.length > 0 && <p className="mt-3 text-xs text-slate-500">Accept a request to go available using your current GPS location.</p>}
    </>}
    {alertRequest && <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby="live-sos-alert-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl"><header className="flex items-start justify-between bg-rose-700 px-5 py-4 text-white"><div className="flex items-center gap-3"><Siren className="h-6 w-6 animate-pulse" /><div><p className="text-xs font-bold uppercase tracking-widest text-rose-100">Emergency SOS · {remainingSeconds}s remaining</p><h2 id="live-sos-alert-title" className="mt-1 text-lg font-black">SOS request received</h2></div></div><div className="relative grid h-11 w-11 shrink-0 place-items-center"><svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="4"/><circle cx="22" cy="22" r="18" fill="none" stroke="white" strokeWidth="4" strokeDasharray="113.1" strokeDashoffset={`${113.1 * (1 - remainingSeconds / 10)}`} strokeLinecap="round"/></svg><span className="text-xs font-black">{remainingSeconds}</span></div></header><div className="space-y-2 p-5"><p className="font-bold text-slate-900">{alertRequest.patientName} · {alertRequest.urgency || priorityOf(alertRequest)}</p><p className="text-sm text-slate-600">{alertRequest.incidentType}</p><p className="flex items-center gap-1 text-sm text-rose-800"><MapPin className="h-4 w-4" />{alertRequest.distanceKm != null ? `${alertRequest.distanceKm} km away · ` : ''}approximate area {alertRequest.location.latitude.toFixed(2)}, {alertRequest.location.longitude.toFixed(2)}</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={busy || Boolean(activeRequest)} onClick={() => void accept(alertRequest.id)} className="rounded-lg bg-rose-700 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">Accept</button><button type="button" disabled={busy} onClick={() => void reject(alertRequest.id)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Decline</button></div></div></section></div>}
  </section>;
}
