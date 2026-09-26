'use client';

import { useEffect, useRef, useState } from 'react';
import { Ambulance, Heart, MapPin, Phone, Check, X } from 'lucide-react';
import { CareLinkProvider, useCareLink } from '../../context/CareLinkContext';
import { ProfileMenu } from '../../components/common/ProfileMenu';
import { MapView } from '../../components/common/MapView';
import type { EmergencyRequest } from '../../types';

function DriverHome() {
  const { emergencies, acceptEmergency, rejectDriverEmergency, setSelectedEmergencyId } = useCareLink();
  const [dismissedSOS, setDismissedSOS] = useState<string[]>([]);
  const [assignmentAlert, setAssignmentAlert] = useState<EmergencyRequest | null>(null);
  const previousStatuses = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const previous = previousStatuses.current;
    const newlyAssigned = previous && emergencies.find((request) => request.status === 'Assigned' && previous.get(request.id) !== 'Assigned');
    if (newlyAssigned) {
      // Open the alert when a queued request changes into an assignment.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAssignmentAlert(newlyAssigned);
    }
    previousStatuses.current = new Map<string, string>(emergencies.map((request): [string, string] => [request.id, request.status]));
  }, [emergencies]);
  const incoming = emergencies.filter((request) => ['Pending', 'Finding hospital', 'Assigned'].includes(request.status));
  const assigned = emergencies.filter((request) => request.status === 'En Route');
  const acceptedAssignment = assigned.find((request) => request.status === 'En Route') ?? assigned[0];
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
  const viewOnMap = (id: string) => setSelectedEmergencyId(id);
  return <main className="min-h-screen bg-slate-50">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2 text-white"><Heart className="h-5 w-5 fill-current" /></span><div><p className="font-black">Care<span className="text-rose-600">Link</span></p><p className="text-xs text-slate-500">Driver workspace</p></div></div><ProfileMenu /></header>
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      <div className="mb-7 flex items-center gap-3"><span className="rounded-xl bg-amber-100 p-3 text-amber-700"><Ambulance /></span><div><h1 className="text-3xl font-bold">Driver dashboard</h1><p className="text-sm text-slate-500">Review urgent calls, assignments, and patient destinations.</p></div></div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.6fr)]">
        <section className="order-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-24"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold">Destination map</h2><p className="text-xs text-slate-500">Selected patient location</p></div><MapPin className="h-5 w-5 text-rose-600" /></div><MapView height="440px" showRouteLine /></section>
        <div className="order-2 space-y-6">
          <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Urgent SOS requests</h2><p className="text-xs text-slate-500">Accept to respond or reject to pass the request on.</p></div><span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">{incoming.length} waiting</span></div>
            {incoming.length ? <div className="space-y-3">{incoming.map((request) => <article key={request.id} className="rounded-xl border border-rose-200 bg-rose-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-rose-950">SOS · {request.condition}</p><p className="mt-1 text-sm text-rose-900">{request.patientName} · {request.age} · {request.gender}</p><p className="mt-1 flex items-start gap-1 text-xs text-rose-800"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{request.location.address}</p><p className="mt-1 flex items-center gap-1 text-xs text-rose-800"><Phone className="h-3.5 w-3.5" />{request.patientPhone || 'No phone provided'}</p></div><span className="rounded-full bg-rose-700 px-2.5 py-1 text-[11px] font-bold uppercase text-white">{request.priority} priority</span></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => viewOnMap(request.id)} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-900">View details & map</button><button type="button" onClick={() => acceptEmergency(request.id)} className="flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800"><Check className="h-4 w-4" />Accept call</button><button type="button" onClick={() => rejectDriverEmergency(request.id)} className="flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"><X className="h-4 w-4" />Reject</button></div></article>)}</div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No incoming SOS requests.</p>}
          </section>
          {acceptedAssignment ? <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Accepted assignment</h2><p className="text-xs text-slate-500">Current patient and pickup details</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{acceptedAssignment.status}</span></div><div className="space-y-3 rounded-xl bg-sky-50 p-4"><p className="text-lg font-bold text-slate-900">{acceptedAssignment.patientName} · {acceptedAssignment.age} · {acceptedAssignment.gender}</p><p className="text-sm font-medium text-slate-700">{acceptedAssignment.condition} · {acceptedAssignment.priority} priority</p><p className="flex items-start gap-2 text-sm text-slate-600"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />{acceptedAssignment.patientPhone || 'No phone number provided'}</p><p className="flex items-start gap-2 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />{acceptedAssignment.location.address}</p><p className="text-xs text-slate-500">{acceptedAssignment.vitals.conditionNotes}</p><button type="button" onClick={() => viewOnMap(acceptedAssignment.id)} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600">Show this patient on map</button></div></section> : <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">No accepted assignment yet. New SOS calls will appear here after you accept them.</section>}
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




