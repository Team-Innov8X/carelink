import React, { useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import {
  Heart,
  Search,
  Bell,
  UserRound,
} from 'lucide-react';
import { authClient } from '../../lib/auth-client';

export const Navbar: React.FC = () => {
  const {
    setActiveTab,
    emergencies,
  } = useCareLink();

  const [searchQuery, setSearchQuery] = useState('');
  const { data: session } = authClient.useSession();
  const profileName = session?.user?.name || session?.user?.email || 'My profile';
  const initials = profileName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'U';

  const activeEmergenciesCount = emergencies.filter(
    (e) => e.status !== 'Completed' && e.status !== 'Rejected'
  ).length;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      {/* Main Navbar */}
      <div className="w-full px-5 sm:px-8 lg:px-10 h-16 flex items-center justify-between gap-4">
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

        {/* Right Section: Notification and account */}
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

          <button
            type="button"
            className="group flex max-w-44 items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 transition hover:border-sky-200 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            title={profileName}
            aria-label={`Profile: ${profileName}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-600 to-indigo-600 text-xs font-bold text-white shadow-sm">
              {session?.user?.image ? <img src={session.user.image} alt="" className="h-full w-full object-cover" /> : initials || <UserRound className="h-4 w-4" />}
            </span>
            <span className="max-w-28 truncate text-sm font-semibold text-slate-700 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{profileName}</span>
          </button>

        </div>
      </div>
    </header>
  );
};
