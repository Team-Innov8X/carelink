import React, { useState } from 'react';
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
import { MobileNav } from './components/mobile/MobileNav';
import { Siren } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { activeTab } = useCareLink();
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
          {activeTab === 'hospitals' && <HospitalDirectory />}
          {activeTab === 'recommendations' && <SmartRecommendations />}
          {activeTab === 'handoff' && <PatientHandoffView />}
          {activeTab === 'pharmacy' && <MedicineSearch mode="patient" />}
          {activeTab === 'hospital-portal' && <HospitalStaffView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Responsive Mobile Bottom Tab Bar matching Panel 10 */}
      <MobileNav />

      <button
        type="button"
        onClick={() => setIsNewEmergencyOpen(true)}
        aria-label="Create SOS emergency call"
        title="Create SOS emergency call"
        className="fixed bottom-20 right-5 z-50 flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3.5 text-sm font-bold text-white shadow-xl shadow-rose-900/30 transition hover:-translate-y-0.5 hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 md:bottom-6 md:right-6"
      >
        <Siren className="h-5 w-5" />
        SOS Call
      </button>

      {/* Modals */}
      <NewEmergencyModal
        isOpen={isNewEmergencyOpen}
        onClose={() => setIsNewEmergencyOpen(false)}
      />
      <DoubleBookingModal />
    </div>
  );
};

export function App() {
  return (
    <CareLinkProvider>
      <MainAppContent />
    </CareLinkProvider>
  );
}

export default App;
