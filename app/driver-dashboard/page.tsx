'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Ambulance, Heart } from 'lucide-react';
import { CareLinkProvider } from '../../context/CareLinkContext';
import { ProfileMenu } from '../../components/common/ProfileMenu';
import { MapView } from '../../components/common/MapView';
import { LiveSOSRequests } from '../../components/driver/LiveSOSRequests';
import { authClient } from '../../lib/auth-client';

function DriverHome() {
  const { data: session, isPending } = authClient.useSession();
  const [locations, setLocations] = useState<{ patient: [number, number]; driver?: [number, number]; hospital?: [number, number] }>();
  const role = (session?.user as ({ role?: string } | undefined))?.role;
  if (isPending) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading driver workspace…</main>;
  if (!session || !['driver', 'ambulance_driver'].includes(role || '')) return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"><h1 className="text-lg font-bold text-slate-900">Driver access required</h1><p className="mt-2 text-sm text-slate-600">Sign in with a driver account to open this workspace.</p><Link href="/signin" className="mt-4 inline-flex rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white">Sign in</Link></section></main>;
  return <main className="min-h-screen bg-slate-50 pb-28 text-slate-900 md:pb-8">
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Driver workspace</p></div></div>
      <div className="flex items-center gap-3"><span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800">Driver</span><ProfileMenu /></div>
    </header>
    <div className="mx-auto max-w-4xl space-y-5 px-3 py-5 sm:px-5 sm:py-7">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-sky-100 p-3 text-sky-700"><Ambulance /></span><div><h1 className="text-2xl font-bold">Driver dashboard</h1><p className="text-sm text-slate-500">Calls, trip updates, and hospital handover in one place.</p></div></div>
      <LiveSOSRequests onShowOnMap={(patient, driver, hospital) => setLocations({ patient, driver, hospital })} />
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="mb-3"><h2 className="font-bold">Trip map</h2><p className="text-xs text-slate-500">Driver, pickup, and hospital destination</p></div>{locations ? <MapView center={locations.patient} patientLocation={locations.patient} driverLocation={locations.driver} hospitalLocation={locations.hospital} showNetworkMarkers={false} height="min(52vh, 420px)" /> : <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Open an SOS call to show its pickup, driver location, and hospital route.</div>}</section>
    </div>
  </main>;
}

export default function DriverDashboardPage() {
  return <CareLinkProvider><DriverHome /></CareLinkProvider>;
}
