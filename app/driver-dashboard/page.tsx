'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ambulance, Heart } from '@/components/icons';
import { CareLinkProvider } from '../../context/CareLinkContext';
import { ProfileMenu } from '../../components/common/ProfileMenu';
import { MapView } from '../../components/common/MapView';
import { LiveSOSRequests } from '../../components/driver/LiveSOSRequests';
import { DriverNotifications } from '../../components/driver/DriverNotifications';
import { authClient } from '../../lib/auth-client';

function DriverHome() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [locations, setLocations] = useState<{ patient: [number, number]; driver?: [number, number]; hospital?: [number, number] }>();
  const [driverPosition, setDriverPosition] = useState<[number, number]>();
  const [tripStage, setTripStage] = useState<string>();
  const role = (session?.user as ({ role?: string } | undefined))?.role;
  useEffect(() => {
    if (isPending) return;
    if (!session) router.replace('/signin');
    else if (!['driver', 'ambulance_driver'].includes(role || '')) router.replace('/');
  }, [isPending, role, router, session]);
  if (isPending) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading driver workspace…</main>;
  if (!session || !['driver', 'ambulance_driver'].includes(role || '')) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Opening the correct workspace…</main>;
  return <main className="min-h-screen bg-slate-50 pb-28 text-slate-900 md:pb-8">
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Driver workspace</p></div></div>
      <div className="flex items-center gap-3"><span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800">Driver</span><DriverNotifications /><ProfileMenu /></div>
    </header>
    <div className="mx-auto max-w-4xl space-y-5 px-3 py-5 sm:px-5 sm:py-7">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-sky-100 p-3 text-sky-700"><Ambulance /></span><div><h1 className="text-2xl font-bold">Driver dashboard</h1><p className="text-sm text-slate-500">Calls, trip updates, and hospital handover in one place.</p></div></div>
      <LiveSOSRequests onShowOnMap={(patient, driver, hospital, stage) => { setLocations({ patient, driver, hospital }); setTripStage(stage); }} onDriverLocation={setDriverPosition} />
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="mb-3"><h2 className="font-bold">Trip map</h2><p className="text-xs text-slate-500">Live driver GPS, patient pickup, and hospital destination</p></div><MapView center={driverPosition ?? locations?.patient} patientLocation={locations?.patient} driverLocation={driverPosition ?? locations?.driver} hospitalLocation={locations?.hospital} routeMode={['patient_on_board', 'en_route_hospital', 'arrived_hospital', 'handover_complete'].includes(tripStage || '') ? 'patient_to_hospital' : 'driver_to_patient'} showNetworkMarkers={false} useContextFallback={false} emptyMessage="Waiting for a GPS location. Go available to center the map on your ambulance." height="min(52vh, 420px)" /></section>
    </div>
  </main>;
}

export default function DriverDashboardPage() {
  return <CareLinkProvider><DriverHome /></CareLinkProvider>;
}
