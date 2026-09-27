import React, { useState } from 'react';
import type { Role } from './types';
import { CareLinkProvider, useCareLink } from './context/CareLinkContext';
import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/common/Sidebar';
import { DispatcherDashboard } from './components/dispatcher/DispatcherDashboard';
import { HospitalDirectory } from './components/hospitals/HospitalDirectory';
import { SmartRecommendations } from './components/hospitals/SmartRecommendations';
import { HospitalStaffView } from './components/hospitalStaff/HospitalStaffView';
import { PatientHandoffView } from './components/handoff/PatientHandoffView';
import { MedicineSearch } from './components/pharmacy/MedicineSearch';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { DoubleBookingModal } from './components/hospitals/DoubleBookingModal';
import { NewEmergencyModal } from './components/dispatcher/NewEmergencyModal';
import { EmergencyRequestsView } from './components/dispatcher/EmergencyRequestsView';
import { MobileNav } from './components/mobile/MobileNav';
import { Siren } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { activeTab, role } = useCareLink();
  const [isNewEmergencyOpen, setIsNewEmergencyOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-sky-500 selection:text-white pb-16 md:pb-0">
      {/* Patient-facing network navigation */}
      <Navbar />

      {/* Main Content Layout */}
      <div className="flex-1 flex">
        {/* Left Navigation Sidebar matching Panel 2 */}
        <Sidebar />

        {/* Dynamic Center View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
          {activeTab === 'dashboard' && <DispatcherDashboard />}
          {activeTab === 'requests' && <EmergencyRequestsView onOpenNewEmergency={() => setIsNewEmergencyOpen(true)} />}
          {activeTab === 'hospitals' && <HospitalDirectory />}
          {activeTab === 'recommendations' && (role === 'patient' ? <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-sky-100 bg-white p-10 text-center shadow-sm"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Siren className="h-7 w-7" /></div><h1 className="text-2xl font-black text-slate-900">Feature coming soon</h1><p className="mt-2 text-sm text-slate-500">Smart Match is being prepared and will be available here soon.</p></section> : <SmartRecommendations />)}
          {activeTab === 'handoff' && <PatientHandoffView />}
          {activeTab === 'pharmacy' && <MedicineSearch mode="patient" />}
          {activeTab === 'hospital-portal' && <HospitalStaffView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Responsive Mobile Bottom Tab Bar matching Panel 10 */}
      <MobileNav />

      {role !== 'patient' && <button
        type="button"
        onClick={() => setIsNewEmergencyOpen(true)}
        aria-label="Create SOS emergency call"
        title="Create SOS emergency call"
        className="fixed bottom-20 right-5 z-50 flex items-center gap-2.5 rounded-full bg-rose-600 px-6 py-4 text-base font-bold text-white shadow-xl shadow-rose-900/30 transition hover:-translate-y-0.5 hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 md:bottom-6 md:right-6"
      >
        <Siren className="h-6 w-6" />
        SOS Call
      </button>}

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
