import React from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import {
  LayoutDashboard,
  Building2,
  Pill,
  BarChart3,
  Settings,
  Activity,
  HeartHandshake,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, medicines } = useCareLink();

  // Count unavailable / out of stock medicines
  const outOfStockCount = medicines.filter((m) =>
    Object.values(m.stock).some((qty) => qty === 0)
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
      label: 'Medicine & Pharmacy',
      icon: <Pill className="w-5 h-5" />,
      badge: outOfStockCount > 0 ? `${outOfStockCount} Alerts` : undefined,
      badgeColor: 'bg-purple-100 text-purple-700',
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
    <aside className="w-64 bg-slate-900 text-slate-300 hidden md:flex flex-col shrink-0 min-h-[calc(100vh-64px)] border-r border-slate-800">
      <div className="p-4 flex-1 space-y-1.5">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Navigation
        </div>
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-sky-600 text-white font-semibold shadow-md shadow-sky-900/30'
                  : 'hover:bg-slate-800 hover:text-white text-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={isActive ? 'text-white' : 'text-slate-400'}>
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

      {/* Ambulance Dispatch Quick Status Card */}
      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 font-medium">GPS Dispatch Network</span>
            <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Online
            </span>
          </div>
          <div className="flex items-center justify-between text-sm font-semibold text-white">
            <span>5 Units Active</span>
            <span className="text-xs text-sky-400 font-mono">100% Signal</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
