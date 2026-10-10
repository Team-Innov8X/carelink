import React, { useEffect, useRef, useState } from 'react';
import type { Role } from './types';
import { CareLinkProvider, useCareLink } from './context/CareLinkContext';
import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/common/Sidebar';
import { DispatcherDashboard } from './components/dispatcher/DispatcherDashboard';
import { HospitalDirectory } from './components/hospitals/HospitalDirectory';
import { HospitalDetailsView } from './components/hospitals/HospitalDetailsView';
import { SmartRecommendations } from './components/hospitals/SmartRecommendations';
import { PatientHandoffView } from './components/handoff/PatientHandoffView';
import { MedicineSearch } from './components/pharmacy/MedicineSearch';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { DoubleBookingModal } from './components/hospitals/DoubleBookingModal';
import { NewEmergencyModal } from './components/dispatcher/NewEmergencyModal';
import { EmergencyRequestsView } from './components/dispatcher/EmergencyRequestsView';
import { NotificationCenter } from './components/notifications/NotificationCenter';
import { MobileNav } from './components/mobile/MobileNav';
import { LoaderCircle, Siren, CheckCircle2, X } from './components/icons';
import { PatientEmergencyRequestsView } from './components/patient/PatientEmergencyRequestsView';
import { RoutineDriverBookingView } from './components/patient/RoutineDriverBookingView';
import { TriageChatView } from './components/patient/TriageChatView';
import { HospitalStaffView } from './components/hospitalStaff/HospitalStaffView';

const SOS_NOTICE_TIMEOUT_MS = 30_000;

const MainAppContent: React.FC = () => {
  const { activeTab, role, setActiveTab } = useCareLink();
  const [isNewEmergencyOpen, setIsNewEmergencyOpen] = useState(false);
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const sosSubmittingRef = useRef(false);
  const sosIdempotencyKey = useRef<string | null>(null);
  const [sosMessage, setSosMessage] = useState('');
  const [sosRequestId, setSosRequestId] = useState('');
  const [sosCancelPending, setSosCancelPending] = useState(false);
  const [sosUndoEnabled, setSosUndoEnabled] = useState(false);
  const [sosNeedsPickupAddress, setSosNeedsPickupAddress] = useState(false);
  const [sosPickupAddress, setSosPickupAddress] = useState('');
  const [sosAddressSubmitting, setSosAddressSubmitting] = useState(false);
  const [sosNoticeTimeoutMs, setSosNoticeTimeoutMs] = useState(SOS_NOTICE_TIMEOUT_MS);
  const [sosNoticePaused, setSosNoticePaused] = useState(false);
  const [sosNoticeVersion, setSosNoticeVersion] = useState(0);
  const sosToastTimer = useRef<number | null>(null);
  const sosNoticeRemaining = useRef(SOS_NOTICE_TIMEOUT_MS);
  const sosNoticeDeadline = useRef(0);
  const sosNoticePauseReasons = useRef(new Set<'pointer' | 'focus'>());
  useEffect(() => () => { if (sosToastTimer.current !== null) window.clearTimeout(sosToastTimer.current); }, []);

  useEffect(() => {
    if (!sosMessage || sosNoticePaused) return;
    sosNoticeDeadline.current = Date.now() + sosNoticeRemaining.current;
    sosToastTimer.current = window.setTimeout(() => {
      sosToastTimer.current = null;
      sosNoticeRemaining.current = 0;
      sosNoticePauseReasons.current.clear();
      setSosNoticePaused(false);
      setSosMessage('');
      setSosRequestId('');
      setSosUndoEnabled(false);
    }, sosNoticeRemaining.current);
    return () => {
      if (sosToastTimer.current !== null) window.clearTimeout(sosToastTimer.current);
      sosToastTimer.current = null;
    };
  }, [sosMessage, sosNoticePaused, sosNoticeVersion]);

  const showSosToast = (message: string, requestId?: string | null, timeoutMs = SOS_NOTICE_TIMEOUT_MS, undoEnabled = false) => {
    if (sosToastTimer.current !== null) window.clearTimeout(sosToastTimer.current);
    sosToastTimer.current = null;
    sosNoticeRemaining.current = timeoutMs;
    setSosNoticeTimeoutMs(timeoutMs);
    setSosUndoEnabled(undoEnabled);
    setSosNoticeVersion((version) => version + 1);
    if (requestId !== undefined) setSosRequestId(requestId ?? '');
    setSosMessage(message);
  };

  const pauseSosNotice = (reason: 'pointer' | 'focus') => {
    if (sosNoticePauseReasons.current.has(reason)) return;
    if (sosNoticePauseReasons.current.size === 0 && sosNoticeDeadline.current) {
      sosNoticeRemaining.current = Math.max(0, sosNoticeDeadline.current - Date.now());
    }
    sosNoticePauseReasons.current.add(reason);
    setSosNoticePaused(true);
  };

  const resumeSosNotice = (reason: 'pointer' | 'focus') => {
    sosNoticePauseReasons.current.delete(reason);
    setSosNoticePaused(sosNoticePauseReasons.current.size > 0);
  };

  const dismissSosNotice = () => {
    if (sosToastTimer.current !== null) window.clearTimeout(sosToastTimer.current);
    sosToastTimer.current = null;
    sosNoticeRemaining.current = 0;
    sosNoticePauseReasons.current.clear();
    setSosNoticePaused(false);
    setSosRequestId('');
    setSosMessage('');
    setSosUndoEnabled(false);
    setSosNeedsPickupAddress(false);
  };

  const cancelSosRequest = async () => {
    if (!sosRequestId || sosCancelPending) return;
    setSosCancelPending(true);
    try {
      const response = await fetch(`/api/sos/${encodeURIComponent(sosRequestId)}/cancel`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'This SOS can no longer be cancelled.');
      window.dispatchEvent(new Event('carelink-sos-updated'));
      showSosToast('SOS cancelled. It remains in your Emergency Request history.', null);
    } catch (cause) {
      showSosToast(cause instanceof Error ? cause.message : 'Could not cancel this SOS.');
    } finally {
      setSosCancelPending(false);
    }
  };

  const handleSOS = (incidentType = 'Emergency assistance requested') => {
    if (role !== 'patient') {
      setIsNewEmergencyOpen(true);
      return;
    }
    if (sosSubmittingRef.current) return;
    sosSubmittingRef.current = true;
    const sendRequest = async (location: { latitude: number; longitude: number }, pickupAddress?: string) => {
      try {
        const idempotencyKey = sosIdempotencyKey.current ??= window.crypto.randomUUID();
        const response = await fetch('/api/sos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ location: pickupAddress ? { ...location, address: pickupAddress } : location, incidentType, pickupAddress }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not send your emergency request.');
        sosIdempotencyKey.current = null;
        const statusMessage = result.message || (!result.existing
          ? 'Emergency request sent to the hospital and ambulance network'
          : result.request.status === 'completed'
            ? 'This recent SOS was already handled'
            : 'Your SOS request has already been created');
        const canUndo = !result.existing && result.request.status === 'searching';
        showSosToast(`${statusMessage.replace(/[.\s]+$/, '')}. Reference: ${result.request.id}`, canUndo ? result.request.id : null, canUndo ? result.undoWindowSeconds * 1000 : SOS_NOTICE_TIMEOUT_MS, canUndo);
        setSosNeedsPickupAddress(false);
        setActiveTab('dashboard');
        window.dispatchEvent(new Event('carelink-sos-updated'));
      } catch (error) {
        showSosToast(error instanceof Error ? error.message : 'Could not send your emergency request.');
      } finally {
        sosSubmittingRef.current = false;
        setSosSubmitting(false);
      }
    };

    if (!navigator.geolocation) {
      setSosNeedsPickupAddress(true);
      showSosToast('GPS is unavailable. Enter a pickup address to send this SOS.');
      sosSubmittingRef.current = false;
      return;
    }

    setSosSubmitting(true);
    showSosToast('Getting your GPS location…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      void sendRequest({ latitude: coords.latitude, longitude: coords.longitude });
    }, (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. Allow GPS or enter a pickup address to send this SOS.'
        : error.code === error.TIMEOUT
          ? 'Could not get your location in time. Try GPS again or enter a pickup address.'
          : 'Your location is unavailable. Turn on GPS or enter a pickup address.';
      setSosNeedsPickupAddress(true);
      showSosToast(message);
      sosSubmittingRef.current = false;
      setSosSubmitting(false);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };

  const sendSosFromAddress = async () => {
    if (sosSubmittingRef.current || sosAddressSubmitting) return;
    if (sosPickupAddress.trim().length < 5) { showSosToast('Enter a pickup address with a street, city, or nearby landmark.'); return; }
    sosSubmittingRef.current = true;
    setSosAddressSubmitting(true);
    setSosSubmitting(true);
    showSosToast('Finding the pickup address…');
    try {
      const lookup = await fetch('/api/places/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: sosPickupAddress.trim() }) });
      const geocoded = await lookup.json();
      if (!lookup.ok) throw new Error(geocoded.error || 'Could not find that pickup address.');
      await sendRequestFromResolvedAddress(geocoded.location, sosPickupAddress.trim());
    } catch (cause) {
      showSosToast(cause instanceof Error ? cause.message : 'Could not send your emergency request.');
    } finally {
      sosSubmittingRef.current = false;
      setSosSubmitting(false);
      setSosAddressSubmitting(false);
    }
  };

  const sendRequestFromResolvedAddress = async (location: { latitude: number; longitude: number }, pickupAddress: string) => {
    try {
      const idempotencyKey = sosIdempotencyKey.current ??= window.crypto.randomUUID();
      const response = await fetch('/api/sos', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ location: { ...location, address: pickupAddress }, incidentType: 'Emergency assistance requested', pickupAddress }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not send your emergency request.');
      sosIdempotencyKey.current = null;
      const canUndo = !result.existing && result.request.status === 'searching';
      showSosToast(`${(result.message || 'Emergency request sent').replace(/[.\s]+$/, '')}. Reference: ${result.request.id}`, canUndo ? result.request.id : null, canUndo ? result.undoWindowSeconds * 1000 : SOS_NOTICE_TIMEOUT_MS, canUndo);
      setSosNeedsPickupAddress(false);
      setActiveTab('dashboard');
      window.dispatchEvent(new Event('carelink-sos-updated'));
    } catch (cause) {
      showSosToast(cause instanceof Error ? cause.message : 'Could not send your emergency request.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-sky-500 selection:text-white pb-16 md:pb-0">
      {/* Patient-facing network navigation */}
      <Navbar />

      {/* Main Content Layout */}
      <div className="flex-1 flex">
        {/* Left Navigation Sidebar matching Panel 2 */}
        <Sidebar />

        {/* Dynamic Center View */}
        <main className="flex-1 p-4 pb-32 sm:p-6 sm:pb-32 lg:p-8 lg:pb-32 max-w-7xl mx-auto w-full overflow-y-auto">
          {activeTab === 'dashboard' && <DispatcherDashboard />}
          {activeTab === 'requests' && (
            role === 'patient' ? (
              <PatientEmergencyRequestsView />
            ) : (
              <EmergencyRequestsView onOpenNewEmergency={() => setIsNewEmergencyOpen(true)} />
            )
          )}
          {activeTab === 'triage' && <TriageChatView />}
          {activeTab === 'driver-request' && <RoutineDriverBookingView />}
          {activeTab === 'notifications' && <NotificationCenter />}
          {activeTab === 'hospitals' && <HospitalDirectory />}
          {activeTab === 'hospital-view' && <HospitalDetailsView />}
          {activeTab === 'hospital-portal' && <HospitalStaffView />}
          {activeTab === 'recommendations' && (role === 'patient' ? <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-sky-100 bg-white p-10 text-center shadow-sm"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Siren className="h-7 w-7" /></div><h1 className="text-2xl font-black text-slate-900">Feature coming soon</h1><p className="mt-2 text-sm text-slate-500">Smart Match is being prepared and will be available here soon.</p></section> : <SmartRecommendations />)}
          {activeTab === 'handoff' && <PatientHandoffView />}
          {activeTab === 'pharmacy' && <MedicineSearch mode="patient" />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Responsive Mobile Bottom Tab Bar matching Panel 10 */}
      <MobileNav />

      <button
        type="button"
        onClick={() => handleSOS()}
        disabled={sosSubmitting}
        aria-label={role === 'patient' ? 'Request emergency assistance with SOS' : 'Create SOS emergency call'}
        title={role === 'patient' ? 'Request emergency assistance' : 'Create SOS emergency call'}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 flex min-h-14 items-center gap-2 rounded-full bg-rose-700 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-900/25 transition hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 disabled:cursor-wait disabled:opacity-80 md:bottom-6 md:right-6"
      >
        {sosSubmitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Siren className="h-5 w-5" />}
        {sosSubmitting ? 'Sending…' : role === 'patient' ? 'SOS' : 'SOS Call'}
      </button>
      {role === 'patient' && sosMessage && (
        <aside
          role="status"
          aria-live="polite"
          onMouseEnter={() => pauseSosNotice('pointer')}
          onMouseLeave={() => resumeSosNotice('pointer')}
          onFocus={() => pauseSosNotice('focus')}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resumeSosNotice('focus'); }}
          className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] right-4 z-50 max-w-[calc(100vw-2rem)] sm:max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl md:bottom-20 md:right-6 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold text-slate-900 text-sm">Emergency request status</p>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{sosMessage}</p>
                <p className="mt-2 text-[11px] font-medium text-slate-500">{sosUndoEnabled ? 'Undo is available briefly.' : 'Track this request in Requests · Automatically dismisses after 30 seconds'}</p>
                <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded bg-slate-200"><span key={sosNoticeVersion} style={{ animationDuration: `${sosNoticeTimeoutMs}ms` }} className="block h-full w-full origin-left rounded bg-sky-700 animate-sos-timeout" /></div>
                {sosRequestId && <button type="button" disabled={sosCancelPending} onClick={() => void cancelSosRequest()} className="mt-3 min-h-10 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-60">{sosCancelPending ? 'Undoing…' : sosUndoEnabled ? 'Undo SOS' : 'Cancel SOS'}</button>}
                {sosNeedsPickupAddress && <div className="mt-3 flex flex-col gap-2"><label htmlFor="sos-pickup-address" className="text-xs font-semibold text-slate-700">Pickup address</label><input id="sos-pickup-address" value={sosPickupAddress} onChange={(event) => setSosPickupAddress(event.target.value)} maxLength={240} placeholder="Street, area, city, nearby landmark" className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900" /><button type="button" disabled={sosAddressSubmitting || sosSubmitting} onClick={() => void sendSosFromAddress()} className="min-h-10 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{sosAddressSubmitting ? 'Finding address…' : 'Send SOS from address'}</button></div>}
              </div>
            </div>
            <button type="button" onClick={dismissSosNotice} aria-label="Dismiss SOS message" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </aside>
      )}

      {/* Modals */}
      <NewEmergencyModal
        isOpen={isNewEmergencyOpen}
        onClose={() => setIsNewEmergencyOpen(false)}
      />
      <DoubleBookingModal />
    </div>
  );
};

export function App({ initialRole = 'dispatcher' }: { initialRole?: Role }) {
  return (
    <CareLinkProvider initialRole={initialRole}>
      <MainAppContent />
    </CareLinkProvider>
  );
}

export default App;
