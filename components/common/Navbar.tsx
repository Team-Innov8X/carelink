import React, { useEffect, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import {
  Heart,
  Search,
  Bell,
} from 'lucide-react';
import { ProfileMenu } from './ProfileMenu';
import { SearchField } from './SearchField';

export const Navbar: React.FC = () => {
  const {
    setActiveTab,
    hospitals,
    medicines,
    emergencies,
    role,
    unreadNotificationsCount,
  } = useCareLink();

  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  useEffect(() => {
    const refresh = () => fetch('/api/notifications', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((result) => { if (result) setUnreadNotifications((result.notifications ?? []).filter((item: { readAt?: string | null }) => !item.readAt).length); }).catch(() => {});
    void refresh(); const interval = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(interval);
  }, []);

  const query = searchQuery.trim().toLocaleLowerCase();
  const searchResults = query ? [
    ...hospitals.filter((item) => `${item.name} ${item.location.address} ${item.specialties.join(' ')}`.toLocaleLowerCase().includes(query)).map((item) => ({ id: `hospital-${item.id}`, title: item.name, detail: `${item.location.address} · ${item.status}`, tab: 'hospitals' })),
    ...medicines.filter((item) => `${item.name} ${item.category} ${item.indication}`.toLocaleLowerCase().includes(query)).map((item) => ({ id: `medicine-${item.id}`, title: item.name, detail: `${item.category} · ${item.indication}`, tab: 'pharmacy' })),
    ...(role === 'dispatcher' ? emergencies.filter((item) => `${item.patientName} ${item.condition} ${item.location.address} ${item.status}`.toLocaleLowerCase().includes(query)).map((item) => ({ id: `case-${item.id}`, title: item.patientName, detail: `${item.condition} · ${item.status}`, tab: 'requests' })) : []),
  ].slice(0, 8) : [];
  const unreadCount = Math.max(unreadNotifications, unreadNotificationsCount);
  return (
    <header className="sticky top-0 z-30 relative bg-white border-b border-slate-200 shadow-xs">
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
            <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search hospitals, requests, or patients..." label="Search accessible hospitals, medicines, and cases" className="[&>input]:rounded-xl [&>input]:border-transparent [&>input]:bg-slate-100/80 [&>input]:hover:bg-slate-100 [&>input]:focus:bg-white [&>input]:py-2 [&>input]:pr-4" />
            {query && <div id="global-search-results" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              {searchResults.length ? searchResults.map((result) => <button type="button" role="option" aria-selected="false" key={result.id} onClick={() => { setActiveTab(result.tab); setSearchQuery(''); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-sky-50"><span className="block truncate text-sm font-semibold text-slate-800">{result.title}</span><span className="block truncate text-xs text-slate-500">{result.detail}</span></button>) : <p className="px-3 py-3 text-sm text-slate-500">No results found</p>}
            </div>}
          </div>
        </div>

        {/* Right Section: Notification and account */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button type="button" aria-label="Open search" aria-expanded={mobileSearchOpen} onClick={() => setMobileSearchOpen((open) => !open)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 md:hidden"><Search className="h-5 w-5" /></button>
          {/* Active Emergency Alert Badge */}
          <button
            onClick={() => setActiveTab('notifications')}
            className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700 sm:inline-flex">{role === 'patient' ? 'Patient' : role === 'dispatcher' ? 'Dispatcher' : role.replaceAll('_', ' ')}</span>

          <ProfileMenu />

        </div>
      </div>
      {mobileSearchOpen && <div className="absolute left-0 right-0 top-full z-50 border-b border-slate-200 bg-white p-3 shadow-md md:hidden">
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search hospitals, medicines, requests" label="Search accessible hospitals, medicines, and cases" />
        {query && <div role="listbox" className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-1">
          {searchResults.length ? searchResults.map((result) => <button type="button" role="option" aria-selected="false" key={result.id} onClick={() => { setActiveTab(result.tab); setSearchQuery(''); setMobileSearchOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-sky-50"><span className="block text-sm font-semibold text-slate-800">{result.title}</span><span className="block text-xs text-slate-500">{result.detail}</span></button>) : <p className="px-3 py-3 text-sm text-slate-500">No results found</p>}
        </div>}
      </div>}
    </header>
  );
};


