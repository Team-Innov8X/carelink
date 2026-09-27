'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, BedDouble, CheckCircle2, Clock, Stethoscope } from 'lucide-react';

type PatientRequest = {
  id: string;
  status: string;
  incidentType: string;
  createdAt: string;
  hospitalRequest: null | { status: string; hospitalName: string; acceptedAt?: string; bedCategory?: string; requiredSpecialty?: string };
};

export function PatientSOSStatus() {
  const [requests, setRequests] = useState<PatientRequest[]>([]);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sos', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load emergency requests.');
      setRequests(result.requests ?? []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load emergency requests.');
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    window.addEventListener('carelink-sos-updated', refresh);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); window.removeEventListener('carelink-sos-updated', refresh); };
  }, [refresh]);

  if (!requests.length && !error) return null;
  return <section className="mb-6 rounded-2xl border border-sky-200 bg-white p-5 shadow-xs" aria-live="polite">
    <div className="mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-sky-700" /><h2 className="font-bold text-slate-900">Your Emergency Requests</h2><span className="ml-auto text-xs text-slate-500">Live updates</span></div>
    {error && <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}
    <div className="space-y-3">{requests.slice(0, 5).map((request) => {
      const hospital = request.hospitalRequest;
      const accepted = hospital?.status === 'accepted';
      return <article key={request.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-slate-900">{request.incidentType}</p><p className="mt-1 text-xs text-slate-500">Reference {request.id.slice(0, 8)} · {new Date(request.createdAt).toLocaleString()}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${accepted ? 'bg-emerald-100 text-emerald-800' : hospital?.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{accepted ? 'Hospital accepted' : hospital?.status === 'rejected' ? 'Hospital declined' : 'Waiting for hospital'}</span></div>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">{accepted ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Clock className="h-4 w-4 text-amber-600" />}{hospital ? `${hospital.hospitalName} ${accepted ? 'accepted your request' : 'is reviewing your request'}` : 'Your request is being routed to a hospital'}.</p>
        {accepted && hospital && <div className="mt-2 flex flex-wrap gap-4 text-xs font-medium text-emerald-900">{hospital.bedCategory && <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{hospital.bedCategory.toUpperCase()} bed reserved</span>}{hospital.requiredSpecialty && <span className="inline-flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" />{hospital.requiredSpecialty} doctor assigned</span>}</div>}
      </article>;
    })}</div>
  </section>;
}
