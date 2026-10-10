'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ambulance, Clock, Siren } from '@/components/icons';
import { fetchPatientSosRequests } from '@/lib/client-sos';

type PatientSOS = { id: string; status: 'searching' | 'accepted' | 'completed' | 'cancelled'; incidentType: string; createdAt: string; driverAssigned: boolean; tripStage?: string; destination?: { name: string; status: string; bedCategory?: string } | null; vitalsUpdate?: { bp: string; heartRate: number; spO2: number } | null };

const statusLabel: Record<PatientSOS['status'], string> = {
  searching: 'Finding an available driver',
  accepted: 'A driver accepted your request',
  completed: 'Emergency response completed',
  cancelled: 'Request cancelled',
};

export function PatientSOSStatus() {
  const [request, setRequest] = useState<PatientSOS | null>(null);
  const refresh = useCallback(async () => {
    try {
      const requests = await fetchPatientSosRequests();
      const latest = requests[0] as PatientSOS | undefined;
      setRequest(latest ?? null);
    } catch { /* Keep the most recent status visible if the network is temporarily unavailable. */ }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  if (!request) return null;
  const tripLabel: Record<string, string> = { accepted: 'Driver accepted', arrived_patient: 'Driver arrived at you', patient_on_board: 'You are on board', en_route_hospital: 'En route to hospital', arrived_hospital: 'Arrived at hospital', handover_complete: 'Handover complete' };
  return <section aria-live="polite" className="fixed bottom-36 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-rose-200 bg-white p-4 text-slate-900 shadow-lg md:bottom-24 md:right-6">
    <div className="flex items-start gap-3"><span className="rounded-lg bg-rose-50 p-2 text-rose-700"><Siren className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-rose-800">Emergency SOS · {request.status}</p><p className="mt-1 font-semibold">{request.tripStage ? tripLabel[request.tripStage] || statusLabel[request.status] : statusLabel[request.status]}</p><p className="mt-1 text-sm text-slate-600">{request.incidentType}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" />{new Date(request.createdAt).toLocaleString()}</p>{request.destination && <p className="mt-2 text-xs font-semibold text-sky-800">{request.destination.name} · {request.destination.bedCategory?.toUpperCase() || 'Bed'} · {request.destination.status === 'accepted' ? 'Bed confirmed' : request.destination.status === 'rejected' ? 'Finding another destination' : 'Awaiting confirmation'}</p>}{request.driverAssigned && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-700"><Ambulance className="h-3.5 w-3.5" />Driver assigned</p>}</div></div>
  </section>;
}
