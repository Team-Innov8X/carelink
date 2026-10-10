'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Ambulance, BedDouble, Clock, Stethoscope } from '../icons';
import { DelayedSkeleton, RequestListSkeleton } from '../common/Skeletons';
import { fetchPatientSosRequests } from '../../lib/client-sos';

type PatientRequest = {
  id: string;
  status: string;
  incidentType: string;
  createdAt: string;
  driverAssigned?: boolean;
  destination?: { name: string; status: string; bedCategory?: string; rejectionReason?: string } | null;
};

const terminalStatuses = new Set(['completed', 'cancelled', 'rejected', 'expired']);

export const PatientHomeRequestBox: React.FC = () => {
  const [requests, setRequests] = useState<PatientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      setRequests(await fetchPatientSosRequests());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRequests();
    const interval = window.setInterval(() => void fetchRequests(), 10000);
    window.addEventListener('carelink-sos-updated', fetchRequests);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('carelink-sos-updated', fetchRequests);
    };
  }, [fetchRequests]);

  const current = requests.find((request) => !terminalStatuses.has(request.status.toLowerCase()));
  if (loading) return <section aria-label="Emergency request" aria-busy="true"><h2 className="mb-3 text-lg font-bold">Emergency Request</h2><DelayedSkeleton><RequestListSkeleton /></DelayedSkeleton></section>;

  if (!current) {
    return <section className="mb-6 rounded-2xl border border-[#D8DEE2] bg-[#E6EEF5] p-5 text-[#1B1F23] sm:p-6" aria-live="polite">
      <h2 className="text-lg font-bold">Emergency Request</h2>
      <p className="mt-3 text-base">{error ? "We couldn't load your request right now." : 'No current request right now'}</p>
      {error && <button type="button" onClick={() => void fetchRequests()} className="mt-3 rounded-lg border border-[#1E5A8E] px-4 py-2 text-sm font-semibold text-[#1E5A8E]">Try again</button>}
    </section>;
  }

  const created = new Date(current.createdAt);
  const statusLabel = current.status.replaceAll('_', ' ');
  const hospital = current.destination?.name;

  return <section className="mb-6 rounded-2xl bg-[#1E5A8E] p-5 text-white sm:p-6" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold">Emergency Request</h2><p className="mt-1 text-sm text-white/90">Reference {current.id.slice(0, 10)}</p></div>
      <span className="rounded-full border border-white/50 px-3 py-1 text-sm font-semibold capitalize">{statusLabel}</span>
    </div>
    <p className="mt-4 text-base font-semibold">{current.incidentType}</p>
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      <p className="flex items-center gap-2"><Clock className="h-4 w-4" />Created {Number.isNaN(created.getTime()) ? 'time unavailable' : created.toLocaleString()}</p>
      <p className="flex items-center gap-2">{current.driverAssigned ? <Ambulance className="h-4 w-4" /> : <Activity className="h-4 w-4" />}{current.driverAssigned ? 'Driver assigned' : 'Waiting for a driver'}</p>
      {hospital && <p className="flex items-center gap-2"><BedDouble className="h-4 w-4" />{hospital}{current.destination?.bedCategory ? ` · ${current.destination.bedCategory} bed` : ''}</p>}
      {current.destination?.status && <p className="flex items-center gap-2"><Stethoscope className="h-4 w-4" />Hospital {current.destination.status.replaceAll('_', ' ')}</p>}
    </div>
    {error && <p className="mt-3 text-sm text-white">Updates are temporarily unavailable. {error}</p>}
  </section>;
};
