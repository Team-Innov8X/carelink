'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ambulance, Heart, MapPin, Phone, X, Clock3 } from 'lucide-react';
import { CareLinkProvider, useCareLink } from '../../context/CareLinkContext';
import { ProfileMenu } from '../../components/common/ProfileMenu';
import { MapView } from '../../components/common/MapView';
import { LiveSOSRequests, type ActiveSOS } from '../../components/driver/LiveSOSRequests';
import type { EmergencyRequest } from '../../types';

function DriverHome() {
  const { emergencies, ambulances, acceptEmergency, rejectDriverEmergency, setSelectedEmergencyId } = useCareLink();
  const [dismissedSOS, setDismissedSOS] = useState<string[]>([]);
  const [assignmentAlert, setAssignmentAlert] = useState<EmergencyRequest | null>(null);
  const [liveAssignment, setLiveAssignment] = useState<ActiveSOS | null>(null);
  const [sosMapLocations, setSosMapLocations] = useState<{ patient: [number, number]; driver?: [number, number] }>();
  const showSOSOnMap = useCallback((patient: [number, number], driver?: [number, number]) => {
    if (process.env.NODE_ENV === 'development') {
      setSosMapLocations({ patient: [28.6328, 77.2195], driver: [28.6352, 77.2168] });
      return;
    }
    setSosMapLocations({ patient, driver });
  }, []);
  const previousStatuses = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const previous = previousStatuses.current;
    const newlyAssigned = previous && emergencies.find((request) => request.status === 'Assigned' && previous.get(request.id) !== 'Assigned');
    if (newlyAssigned) {
      // Open the alert when a queued request changes into an assignment.
      setAssignmentAlert(newlyAssigned);
    }
    previousStatuses.current = new Map<string, string>(emergencies.map((request): [string, string] => [request.id, request.status]));
  }, [emergencies]);
  const incoming = emergencies.filter((request) => ['Pending', 'Finding hospital', 'Assigned'].includes(request.status));
  const reportLiveAssignment = useCallback((assignment: ActiveSOS | null) => {
    setLiveAssignment((current) => current?.id === assignment?.id && current?.arrivedAt === assignment?.arrivedAt && current?.acceptedAt === assignment?.acceptedAt ? current : assignment);
  }, []);
  const visibleMapLocations = sosMapLocations ?? (liveAssignment
    ? {
        patient: [liveAssignment.location.latitude, liveAssignment.location.longitude] as [number, number],
        driver: process.env.NODE_ENV === 'development'
          ? [28.6352, 77.2168] as [number, number]
          : liveAssignment.driverLocation ? [liveAssignment.driverLocation.latitude, liveAssignment.driverLocation.longitude] as [number, number] : undefined,
      }
    : undefined);
  const sosAlert = incoming.find((request) => request.status === 'Finding hospital' && !dismissedSOS.includes(request.id));
  const alertRequest = assignmentAlert ?? sosAlert;
  const isAssignmentAlert = !!assignmentAlert;
  const dismissAlert = () => isAssignmentAlert ? setAssignmentAlert(null) : alertRequest && setDismissedSOS((ids) => [...ids, alertRequest.id]);
  const acceptAlert = () => {
    if (!alertRequest) return;
    acceptEmergency(alertRequest.id);
    if (isAssignmentAlert) setAssignmentAlert(null);
    else setDismissedSOS((ids) => [...ids, alertRequest.id]);
  };
  const rejectAlert = () => {
    if (!alertRequest) return;
    rejectDriverEmergency(alertRequest.id);
    if (isAssignmentAlert) setAssignmentAlert(null);
    else setDismissedSOS((ids) => [...ids, alertRequest.id]);
  };
  const viewOnMap = (id: string) => {
    setSelectedEmergencyId(id);
    const request = emergencies.find((item) => item.id === id);
    if (!request) return;
    const assignedVehicle = request.assignedAmbulanceId
      ? ambulances.find((item) => item.id === request.assignedAmbulanceId)
      : undefined;
    setSosMapLocations({
      patient: [request.location.lat, request.location.lng],
      driver: process.env.NODE_ENV === 'development'
        ? [28.6352, 77.2168]
        : assignedVehicle ? [assignedVehicle.location.lat, assignedVehicle.location.lng] : undefined,
    });
  };
  return <main className="min-h-screen bg-slate-50">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Driver workspace</p></div></div><ProfileMenu /></header>
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      <div className="mb-7 flex items-center gap-3"><span className="rounded-xl bg-amber-100 p-3 text-amber-700"><Ambulance /></span><div><h1 className="text-3xl font-bold">Driver dashboard</h1><p className="text-sm text-slate-500">Review live requests, assignments, and patient destinations.</p></div></div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.6fr)]">
        <section className="order-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-24"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold">Destination map</h2><p className="text-xs text-slate-500">Patient and driver locations · Central Delhi demo</p></div><MapPin className="h-5 w-5 text-rose-600" /></div><MapView center={visibleMapLocations?.patient} patientLocation={visibleMapLocations?.patient} driverLocation={visibleMapLocations?.driver} height="440px" showRouteLine={!visibleMapLocations} /></section>
        <div className="order-2 space-y-6">
          <LiveSOSRequests onShowOnMap={showSOSOnMap} onActiveAssignmentChange={reportLiveAssignment} />
          {liveAssignment ? <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-sky-50/70 px-5 py-4">
              <div><p className="text-[11px] font-bold uppercase tracking-wider text-sky-800">Current trip</p><h2 className="mt-0.5 text-lg font-bold text-slate-900">Accepted assignment</h2></div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{liveAssignment.arrivedAt ? 'Arrived at pickup' : 'Accepted'}</span>
            </header>
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xl font-bold text-slate-900">{liveAssignment.patientName}</p><p className="mt-1 text-sm text-slate-600">{liveAssignment.incidentType}</p></div>
                <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{liveAssignment.arrivedAt ? 'Arrival recorded' : 'En route to pickup'}</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pickup location</p><p className="mt-1 flex items-start gap-2 text-sm font-semibold text-slate-800"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />{liveAssignment.location.latitude.toFixed(5)}, {liveAssignment.location.longitude.toFixed(5)}</p></div>
                <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Accepted</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock3 className="h-4 w-4 text-sky-700" />{liveAssignment.acceptedAt ? new Date(liveAssignment.acceptedAt).toLocaleString() : 'Just now'}</p></div>
                <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Requested equipment</p><p className="mt-1 text-sm font-semibold text-slate-800">{liveAssignment.requiredEquipment.length ? liveAssignment.requiredEquipment.join(', ') : 'None specified'}</p></div>
                <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Patient contact</p>{liveAssignment.patientPhone ? <a href={`tel:${liveAssignment.patientPhone}`} className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-sky-800 hover:underline"><Phone className="h-4 w-4" />{liveAssignment.patientPhone}</a> : <p className="mt-1 text-sm text-slate-500">No phone number provided</p>}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setSosMapLocations({ patient: [liveAssignment.location.latitude, liveAssignment.location.longitude], driver: liveAssignment.driverLocation ? [liveAssignment.driverLocation.latitude, liveAssignment.driverLocation.longitude] : undefined })} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600"><MapPin className="h-4 w-4" />Show pickup on map</button>
                <a href={liveAssignment.directionsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open directions</a>
              </div>
            </div>
          </section> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm"><h2 className="font-bold text-slate-800">Accepted assignment</h2><p className="mt-1">No active assignment. Accept a request from the live SOS feed to see patient and pickup details here.</p></section>}
        </div>
      </div>
      {alertRequest && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby="sos-alert-title" className={`w-full max-w-md overflow-hidden rounded-3xl border bg-white shadow-2xl ${isAssignmentAlert ? 'border-sky-300' : 'border-rose-300'}`}><header className={`flex items-center justify-between px-5 py-4 text-white ${isAssignmentAlert ? 'bg-sky-700' : 'bg-rose-700'}`}><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">{isAssignmentAlert ? 'New assignment' : 'Incoming emergency'}</p><h2 id="sos-alert-title" className="mt-1 text-lg font-black">{isAssignmentAlert ? 'Assignment received' : 'SOS response needed'}</h2></div><button type="button" onClick={dismissAlert} aria-label="Dismiss alert" className="rounded-lg p-2 text-white/80 hover:bg-white/15"><X className="h-5 w-5" /></button></header><div className="space-y-2.5 p-5"><p className="text-base font-bold text-slate-900">{alertRequest.patientName} · {alertRequest.age} · {alertRequest.gender}</p><p className={`font-semibold ${isAssignmentAlert ? 'text-sky-800' : 'text-rose-800'}`}>{alertRequest.condition} · {alertRequest.priority} priority</p><p className="flex items-start gap-2 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />{alertRequest.location.address}</p><p className="flex items-center gap-2 text-sm text-slate-600"><Phone className="h-4 w-4 text-sky-700" />{alertRequest.patientPhone || 'No callback number provided'}</p><p className="text-sm text-slate-500">{alertRequest.vitals.conditionNotes}</p><div className="grid grid-cols-2 gap-2.5 pt-2"><button type="button" onClick={() => { viewOnMap(alertRequest.id); dismissAlert(); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">View destination</button><button type="button" onClick={acceptAlert} className={`rounded-xl px-3 py-2.5 text-xs font-bold text-white ${isAssignmentAlert ? 'bg-sky-700 hover:bg-sky-800' : 'bg-rose-700 hover:bg-rose-800'}`}>Accept {isAssignmentAlert ? 'assignment' : 'SOS'}</button><button type="button" onClick={rejectAlert} className="col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-800 hover:bg-rose-100">Reject and pass to another driver</button></div></div></section></div>}
    </div>
  </main>;
}

export default function DriverDashboardPage() {
  const [mounted, setMounted] = useState(false);
  // Defer browser storage reads until hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="min-h-screen bg-slate-50" aria-label="Loading driver dashboard" />;
  return <CareLinkProvider><DriverHome /></CareLinkProvider>;
}
