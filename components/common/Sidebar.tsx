import React, { useEffect, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import {
  LayoutDashboard,
  Siren,
  Building2,
  Pill,
  BarChart3,
  Settings,
  Activity,
  HeartHandshake,
  Bell,
  Car,
  Sparkles,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, medicines, emergencies, role } = useCareLink();
  const activeEmergenciesCount = emergencies.filter((request) => !['Completed', 'Handed over', 'Rejected', 'Timed out', 'Rerouted'].includes(request.status)).length;
  const [networkOnline, setNetworkOnline] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  useEffect(() => {
    let active = true;
    const check = () => fetch('/api/data', { cache: 'no-store' }).then((response) => { if (active) { setNetworkOnline(response.ok); if (response.ok) setLastSynced(new Date()); } }).catch(() => { if (active) setNetworkOnline(false); });
    void check(); const timer = window.setInterval(() => void check(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  // Count unavailable / out of stock medicines
  const outOfStockCount = medicines.filter((m) =>
    Object.values(m.stock).some((qty) => qty <= (m.minimumStock ?? (m.isEmergencyEssential ? 8 : 10)))
  ).length;

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      id: 'hospitals',
      label: 'Hospitals',
      icon: <Building2 className="w-5 h-5" />,
    },
    {
      id: 'pharmacy',
      label: 'Pharmacy',
      icon: <Pill className="w-5 h-5" />,
      badge: outOfStockCount > 0 ? `${outOfStockCount} Alerts` : undefined,
      badgeColor: 'bg-purple-100 text-purple-700',
    },
    {
      id: 'requests',
      label: 'Emergency Requests',
      icon: <Siren className="w-5 h-5" />,
      badge: activeEmergenciesCount > 0 ? activeEmergenciesCount : undefined,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'driver-request',
      label: 'Request Driver',
      icon: <Car className="w-5 h-5" />,
    },
    {
      id: 'triage',
      label: 'Symptom Triage',
      icon: <Sparkles className="w-5 h-5 text-amber-400" />,
      badge: 'SOS AI',
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-5 h-5" />,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'recommendations',
      label: 'Smart Match',
      icon: <Activity className="w-5 h-5" />,
      badge: 'AI',
      badgeColor: 'bg-emerald-100 text-emerald-700',
    },
    {
      id: 'handoff',
      label: 'Patient Handoff',
      icon: <HeartHandshake className="w-5 h-5" />,
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <aside className="w-64 bg-white text-slate-600 hidden md:flex flex-col shrink-0 min-h-[calc(100vh-64px)] border-r border-slate-200">
      <div className="p-4 flex-1 space-y-1.5">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Navigation
        </div>
        {navItems
          .filter((item) => {
            if (role === 'patient') {
              if (['hospital-portal', 'handoff'].includes(item.id)) return false;
            } else {
              if (item.id === 'driver-request') return false;
            }
            return true;
          })
          .map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-sky-600 text-white font-semibold shadow-md shadow-sky-900/30'
                  : 'hover:bg-slate-50 hover:text-slate-900 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={isActive ? 'text-white' : 'text-slate-500'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    item.badgeColor || 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="m-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-700">GPS Dispatch Network</p><span className={`flex items-center gap-1.5 text-xs font-bold ${networkOnline ? 'text-green-700' : 'text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${networkOnline ? 'bg-green-600' : 'bg-slate-400'}`} />{networkOnline ? 'Online' : 'Offline'}</span></div><p className="mt-2 text-xs text-slate-600">{activeEmergenciesCount} active dispatch requests</p><p className="mt-1 text-[11px] text-sky-700">{lastSynced ? `Last synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Checking shared data connection…'}</p></div>
    </aside>
  );
};
