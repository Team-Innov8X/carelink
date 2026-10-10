'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Ambulance } from '@/components/icons';
import { CareLinkProvider } from '../../context/CareLinkContext';
import { MobileNav } from '../../components/mobile/MobileNav';
import { Navbar } from '../../components/common/Navbar';
import { Sidebar } from '../../components/common/Sidebar';
import { MapView } from '../../components/common/MapView';
import { LiveSOSRequests } from '../../components/driver/LiveSOSRequests';
import { authClient } from '../../lib/auth-client';

type DriverMapLocations = {
  patient?: [number, number];
  driver?: [number, number];
  hospital?: [number, number];
  accuracyM?: number | null;
  requestId?: string;
};

function DriverHome() {
  const { data: session, isPending } = authClient.useSession();
  const [locations, setLocations] = useState<DriverMapLocations>();
  const showMap = useCallback((patient?: [number, number], driver?: [number, number], hospital?: [number, number], accuracyM?: number, requestId?: string) => {
    setLocations({ patient, driver, hospital, accuracyM, requestId });
  }, []);
  const role = (session?.user as ({ role?: string } | undefined))?.role;

  if (isPending) return <main className="grid min-h-screen place-items-center bg-[#F6F8F9] text-sm text-slate-500">Loading driver workspace…</main>;
  if (!session || !['driver', 'ambulance_driver'].includes(role || '')) return <main className="grid min-h-screen place-items-center bg-[#F6F8F9] p-5"><section className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"><h1 className="text-lg font-bold text-slate-900">Driver access required</h1><p className="mt-2 text-sm text-slate-600">Sign in with a driver account to open this workspace.</p><Link href="/signin" className="mt-4 inline-flex rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white">Sign in</Link></section></main>;

  return <div className="flex min-h-screen flex-col bg-[#F6F8F9] pb-20 text-slate-900 antialiased md:pb-0">
    <Navbar />
    <div className="flex flex-1">
      <Sidebar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 overflow-y-auto p-3 pb-28 sm:p-5 sm:pb-28 lg:p-7 lg:pb-8">
        <header className="flex items-center gap-3">
          <span className="rounded-xl bg-sky-100 p-3 text-sky-700"><Ambulance className="h-6 w-6" /></span>
          <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Your Driver Dashboard</h1><p className="mt-1 text-sm text-slate-500">Live trip location, requests, and handover details in one place.</p></div>
        </header>

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
          <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_28px_-20px_rgba(15,23,42,0.35)] sm:p-5 xl:col-span-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-base font-bold text-slate-900">Live Trip Map</h2><p className="mt-1 text-xs text-slate-500">Your location, pickup, and hospital destination update automatically</p></div>
              <span className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">{locations?.patient ? 'Active trip' : locations?.driver ? 'Driver location' : 'Map ready'}</span>
            </div>
            <div className="relative overflow-hidden rounded-xl">
              <MapView center={locations?.patient ?? locations?.driver} patientLocation={locations?.patient} patientName="Pickup" driverLocation={locations?.driver} driverAccuracyM={locations?.accuracyM} hospitalLocation={locations?.hospital} fitBoundsKey={locations?.requestId} showRouteLine={Boolean(locations?.patient && locations?.driver)} showNetworkMarkers={false} showDriverLocationControl height="clamp(300px, 48vh, 380px)" />
              {!locations?.driver && <div className="pointer-events-none absolute inset-x-3 bottom-16 z-[1000] mx-auto max-w-sm rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-center text-xs text-slate-600 shadow">Go available to share your GPS location. The map will center on you when the next location fix arrives.</div>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><b className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-sky-700">D</b> Driver</span>{locations?.patient && <span className="inline-flex items-center gap-1.5"><b className="grid h-5 w-5 place-items-center rounded-full bg-rose-100 text-rose-700">P</b> Pickup</span>}{locations?.hospital && <span className="inline-flex items-center gap-1.5"><b className="grid h-5 w-5 place-items-center rounded-full bg-blue-100 text-blue-700">H</b> Hospital</span>}{typeof locations?.accuracyM === 'number' && <span className="rounded-full bg-slate-100 px-2.5 py-1">GPS accuracy ±{Math.round(locations.accuracyM)} m</span>}</div>
          </section>

          <div className="min-w-0 xl:col-span-5"><LiveSOSRequests onShowOnMap={showMap} /></div>
        </div>
      </main>
    </div>
    <MobileNav />
  </div>;
}

export default function DriverDashboardPage() {
  return <CareLinkProvider initialRole="driver"><DriverHome /></CareLinkProvider>;
}
