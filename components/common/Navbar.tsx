import React, { useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { Role } from '../../types';
import {
  Heart,
  Search,
  Bell,
  Activity,
  Sliders,
  RotateCcw,
  ShieldCheck,
  ChevronDown,
  PlusCircle,
  Stethoscope,
  Pill,
  Radio,
  User,
} from 'lucide-react';

interface NavbarProps {
  onOpenNewEmergency: () => void;
  onOpenLogin: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenNewEmergency, onOpenLogin }) => {
  const {
    role,
    setRole,
    activeTab,
    setActiveTab,
    emergencies,
    resetAllData,
  } = useCareLink();

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const activeEmergenciesCount = emergencies.filter(
    (e) => e.status !== 'Completed' && e.status !== 'Rejected'
  ).length;

  const roleLabels: Record<Role, { label: string; icon: React.ReactNode; color: string }> = {
    dispatcher: {
      label: 'Dispatcher',
      icon: <Radio className="w-4 h-4 text-sky-500" />,
      color: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    hospital: {
      label: 'Hospital Staff',
      icon: <Stethoscope className="w-4 h-4 text-emerald-500" />,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    pharmacy: {
      label: 'Pharmacy',
      icon: <Pill className="w-4 h-4 text-purple-500" />,
      color: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    paramedic: {
      label: 'Paramedic / Ambulance',
      icon: <Activity className="w-4 h-4 text-amber-500" />,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    patient: {
      label: 'Patient / Citizen',
      icon: <User className="w-4 h-4 text-slate-500" />,
      color: 'bg-slate-50 text-slate-700 border-slate-200',
    },
  };

  const handleRoleSelect = (newRole: Role) => {
    setRole(newRole);
    setIsRoleDropdownOpen(false);
    if (newRole === 'hospital') {
      setActiveTab('hospital-portal');
    } else if (newRole === 'pharmacy') {
      setActiveTab('pharmacy');
    } else {
      setActiveTab('dashboard');
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      {/* Operational Quick Bar */}
      <div className="bg-slate-900 text-slate-200 px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-white tracking-wide">OPERATIONS:</span>
          <span className="hidden sm:inline text-slate-400">
            Live emergency coordination
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenNewEmergency()}
            className="px-2.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center gap-1 transition-colors"
            title="Create an emergency request"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ SOS Call</span>
          </button>

          <button
            onClick={resetAllData}
            className="px-1.5 py-0.5 text-slate-400 hover:text-white transition-colors"
            title="Restore sample data"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-rose-500 flex items-center justify-center text-white shadow-md shadow-rose-200 group-hover:scale-105 transition-transform">
              <Heart className="w-6 h-6 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-extrabold tracking-tight text-slate-900">
                  Care<span className="text-rose-600">Link</span>
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-rose-100 text-rose-700">
                  Live
                </span>
              </div>
              <p className="text-[11px] text-slate-500 -mt-0.5 hidden sm:block">
                Faster Care, Healthier Tomorrow
              </p>
            </div>
          </div>
        </div>

        {/* Global Search */}
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search hospitals, requests, or patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-sm rounded-xl border border-transparent focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Right Section: Role Switcher, Notification, Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active Emergency Alert Badge */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            title={`${activeEmergenciesCount} active emergency cases`}
          >
            <Bell className="w-5 h-5" />
            {activeEmergenciesCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {activeEmergenciesCount}
              </span>
            )}
          </button>

          {/* Quick Role Switcher */}
          <div className="relative">
            <button
              onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-semibold transition-all ${roleLabels[role].color}`}
            >
              {roleLabels[role].icon}
              <span className="hidden sm:inline">{roleLabels[role].label}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>

            {isRoleDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  Switch Active Role
                </div>
                {(Object.keys(roleLabels) as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRoleSelect(r)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      role === r ? 'bg-sky-50 font-semibold' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {roleLabels[r].icon}
                      <span className="text-sm text-slate-700">{roleLabels[r].label}</span>
                    </div>
                    {role === r && (
                      <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                    )}
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1 px-2">
                  <button
                    onClick={() => {
                      setIsRoleDropdownOpen(false);
                      onOpenLogin();
                    }}
                    className="w-full text-center py-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
                  >
                    Open Login Portal
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Profile Button */}
          <button
            onClick={onOpenLogin}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
          >
            <div className="w-7 h-7 rounded-lg bg-sky-600 text-white font-bold text-xs flex items-center justify-center">
              DP
            </div>
            <span className="text-xs font-semibold text-slate-700 hidden lg:inline">
              Officer V. Roy
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
