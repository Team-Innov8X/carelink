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
import { PatientSOSStatus } from './components/sos/PatientSOSStatus';
import { LoaderCircle, Siren, CheckCircle2, X } from './components/icons';
import { PatientEmergencyRequestsView } from './components/patient/PatientEmergencyRequestsView';
import { PatientSmartMatch } from './components/patient/PatientSmartMatch';
import { PatientHospitalBooking } from './components/patient/PatientHospitalBooking';
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
  const [sosRequestId, setSosRequestId] = useState<string | null>(null);
  const [sosNeedsPickupAddress, setSosNeedsPickupAddress] = useState(false);
  const [sosPickupAddress, setSosPickupAddress] = useState('');
  const [sosAddressSubmitting, setSosAddressSubmitting] = useState(false);
  const sosToastTimer = useRef<number | null>(null);
  useEffect(() => () => { if (sosToastTimer.current !== null) window.clearTimeout(sosToastTimer.current); }, []);

  const showSosToast = (message: string, requestId: string | null = null, timeoutMs = SOS_NOTICE_TIMEOUT_MS) => {
    if (sosToastTimer.current !== null) window.clearTimeout(sosToastTimer.current);
    setSosMessage(message);
    setSosRequestId(requestId);
    if (message) {
      sosToastTimer.current = window.setTimeout(() => {
        setSosMessage('');
        setSosRequestId(null);
        sosToastTimer.current = null;
      }, timeoutMs);
    }
  };

  const submitSosRequest = async (location: { latitude: number; longitude: number }, pickupAddress?: string, incidentType = 'Emergency assistance requested') => {
    try {
      const idempotencyKey = sosIdempotencyKey.current ??= window.crypto.randomUUID();
      const response = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ location: pickupAddress ? { ...location, address: pickupAddress } : location, incidentType, ...(pickupAddress ? { pickupAddress } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not send your emergency request.');
      sosIdempotencyKey.current = null;
      const statusMessage = result.message || (result.existing ? 'Your SOS request has already been created' : 'Emergency request sent to the ambulance network');
      showSosToast(`${statusMessage.replace(/[.\s]+$/, '')}. Reference: ${result.request.id}`, result.request.id, result.existing ? SOS_NOTICE_TIMEOUT_MS : (result.undoWindowSeconds || 5) * 1000);
      setSosNeedsPickupAddress(false);
      setSosPickupAddress('');
      setActiveTab('dashboard');
      window.dispatchEvent(new Event('carelink-sos-updated'));
    } catch (error) {
      showSosToast(error instanceof Error ? error.message : 'Could not send your emergency request.');
    } finally {
      sosSubmittingRef.current = false;
      setSosSubmitting(false);
      setSosAddressSubmitting(false);
    }
  };

  const handleSOS = (incidentType = 'Emergency assistance requested') => {
    if (role !== 'patient') {
      setIsNewEmergencyOpen(true);
      return;
    }
    if (!window.confirm('Emergency SOS\n\nAre you sure you want to request emergency assistance?')) return;
    if (sosSubmittingRef.current) return;
    sosSubmittingRef.current = true;

    if (!navigator.geolocation) {
      setSosNeedsPickupAddress(true);
      showSosToast('GPS is unavailable. Enter a pickup address to send this SOS.');
      sosSubmittingRef.current = false;
      return;
    }

    setSosSubmitting(true);
    showSosToast('Getting your GPS location…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      void submitSosRequest({ latitude: coords.latitude, longitude: coords.longitude }, undefined, incidentType);
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
    const address = sosPickupAddress.trim();
    if (address.length < 5) { showSosToast('Enter a pickup address with a street, city, or nearby landmark.'); return; }
    sosSubmittingRef.current = true;
    setSosAddressSubmitting(true);
    setSosSubmitting(true);
    showSosToast('Finding the pickup address…');
    try {
      const response = await fetch('/api/places/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not find that pickup address.');
      await submitSosRequest(result.location, address);
    } catch (error) {
      showSosToast(error instanceof Error ? error.message : 'Could not find that pickup address.');
      sosSubmittingRef.current = false;
      setSosSubmitting(false);
      setSosAddressSubmitting(false);
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
          {activeTab === 'hospitals' && (role === 'patient' ? <PatientHospitalBooking /> : <HospitalDirectory />)}
          {activeTab === 'hospital-view' && <HospitalDetailsView />}
          {activeTab === 'hospital-portal' && <HospitalStaffView />}
          {activeTab === 'recommendations' && (role === 'patient' ? <PatientSmartMatch /> : <SmartRecommendations />)}
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
                <p className="mt-2 text-[11px] font-medium text-slate-400">Track live driver status under &quot;Your Emergency Requests&quot;.</p>
                {sosRequestId && <button type="button" onClick={() => { setActiveTab('requests'); if (sosToastTimer.current !== null) window.clearTimeout(sosToastTimer.current); setSosMessage(''); setSosRequestId(null); }} className="mt-2 text-xs font-bold text-sky-800 underline underline-offset-2">View emergency request details</button>}
                {sosNeedsPickupAddress && <div className="mt-3 flex flex-col gap-2"><label htmlFor="sos-pickup-address" className="text-xs font-semibold text-slate-700">Pickup address</label><input id="sos-pickup-address" value={sosPickupAddress} onChange={(event) => setSosPickupAddress(event.target.value)} maxLength={240} placeholder="Street, area, city, nearby landmark" className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900" /><button type="button" disabled={sosAddressSubmitting || sosSubmitting} onClick={() => void sendSosFromAddress()} className="min-h-10 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{sosAddressSubmitting ? 'Finding address…' : 'Send SOS from address'}</button></div>}
              </div>
            </div>
            <button type="button" onClick={() => { if (sosToastTimer.current !== null) window.clearTimeout(sosToastTimer.current); setSosMessage(''); setSosRequestId(null); }} aria-label="Dismiss emergency notification" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </aside>
      )}
      {role === 'patient' && <PatientSOSStatus transientNoticeVisible={Boolean(sosMessage)} />}

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
