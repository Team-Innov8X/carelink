import React, { useState } from 'react';
import { CareLinkProvider, useCareLink } from './context/CareLinkContext';
import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/common/Sidebar';
import { DispatcherDashboard } from './components/dispatcher/DispatcherDashboard';
import { EmergencyRequestsView } from './components/dispatcher/EmergencyRequestsView';
import { HospitalDirectory } from './components/hospitals/HospitalDirectory';
import { SmartRecommendations } from './components/hospitals/SmartRecommendations';
import { HospitalStaffView } from './components/hospitalStaff/HospitalStaffView';
import { PatientHandoffView } from './components/handoff/PatientHandoffView';
import { MedicineSearch } from './components/pharmacy/MedicineSearch';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { LoginModal } from './components/auth/LoginModal';
import { DoubleBookingModal } from './components/hospitals/DoubleBookingModal';
import { NewEmergencyModal } from './components/dispatcher/NewEmergencyModal';
import { MobileNav } from './components/mobile/MobileNav';

const MainAppContent: React.FC = () => {
  const { activeTab } = useCareLink();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isNewEmergencyOpen, setIsNewEmergencyOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-sky-500 selection:text-white pb-16 md:pb-0">
      {/* Top Navbar with role switcher and judge demo bar */}
      <Navbar
        onOpenNewEmergency={() => setIsNewEmergencyOpen(true)}
        onOpenLogin={() => setIsLoginOpen(true)}
      />

      {/* Main Content Layout */}
      <div className="flex-1 flex">
        {/* Left Navigation Sidebar matching Panel 2 */}
        <Sidebar />

        {/* Dynamic Center View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
          {activeTab === 'dashboard' && <DispatcherDashboard />}
          {activeTab === 'requests' && (
            <EmergencyRequestsView onOpenNewEmergency={() => setIsNewEmergencyOpen(true)} />
          )}
          {activeTab === 'hospitals' && <HospitalDirectory />}
          {activeTab === 'recommendations' && <SmartRecommendations />}
          {activeTab === 'handoff' && <PatientHandoffView />}
          {activeTab === 'pharmacy' && <MedicineSearch />}
          {activeTab === 'hospital-portal' && <HospitalStaffView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Responsive Mobile Bottom Tab Bar matching Panel 10 */}
      <MobileNav />

      {/* Modals */}
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
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
