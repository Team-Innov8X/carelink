'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import {
  Activity,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Car,
  BedDouble,
  Stethoscope,
  RefreshCw,
  XCircle,
  RotateCcw,
} from 'lucide-react';

export type PatientRequestSummary = {
  id: string;
  status: string;
  incidentType: string;
  createdAt: string;
  acceptedAt?: string;
  arrivedAt?: string | null;
  completedAt?: string;
  driverAssigned?: boolean;
  requestType?: 'emergency' | 'routine';
  patientPhone?: string;
  preferredTime?: string;
  rejectionReason?: string;
  hospitalRequest: null | {
    status: string;
    hospitalName: string;
    acceptedAt?: string;
    bedCategory?: string;
    requiredSpecialty?: string;
  };
};

export type PatientHoldSummary = {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  status: 'pending' | 'queued' | 'confirmed' | 'rejected' | 'expired' | 'cancelled';
  queuePosition?: number;
  seq?: number;
  createdAt: string;
  expiresAt?: string;
  notes?: string;
};

export const PatientHomeRequestBox: React.FC = () => {
  const { setActiveTab } = useCareLink();
  const [requests, setRequests] = useState<PatientRequestSummary[]>([]);
  const [holds, setHolds] = useState<PatientHoldSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState<number>(Date.now());
  const [dismissedRejectionId, setDismissedRejectionId] = useState<string | null>(null);

  // Update current time every second for accurate countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const [resSos, resHolds] = await Promise.all([
        fetch('/api/sos', { cache: 'no-store' }),
        fetch('/api/holds/mine', { cache: 'no-store' }),
      ]);

      const dataSos = await resSos.json();
      if (!resSos.ok) throw new Error(dataSos.error || 'Could not fetch requests');
      setRequests(dataSos.requests ?? []);

      if (resHolds.ok) {
        const dataHolds = await resHolds.json();
        setHolds(dataHolds.holds ?? []);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRequests();
    const interval = window.setInterval(fetchRequests, 5000);
    window.addEventListener('carelink-sos-updated', fetchRequests);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('carelink-sos-updated', fetchRequests);
    };
  }, [fetchRequests]);

  // Current request must be actively in progress:
  // - searching AND created within 60 seconds (1 minute window)
  // - OR accepted / arrived / en route (driver assigned)
  // NOT completed, cancelled, or rejected.
  const currentSosRequest = requests.find((r) => {
    const status = r.status.toLowerCase();
    if (['completed', 'cancelled', 'rejected'].includes(status)) return false;
    if (status === 'searching') {
      const elapsed = now - new Date(r.createdAt).getTime();
      return elapsed < 60000; // Only valid within 60 seconds
    }
    return true; // accepted / en route
  });

  // Active bed hold (queued, pending, confirmed)
  const currentHold = holds.find((h) => {
    return ['queued', 'pending', 'confirmed'].includes(h.status);
  });

  // Check if a searching request just crossed the 60s mark; if so, trigger a re-fetch to register rejection
  useEffect(() => {
    const searching = requests.find((r) => r.status.toLowerCase() === 'searching');
    if (searching) {
      const elapsed = now - new Date(searching.createdAt).getTime();
      if (elapsed >= 60000 && searching.status !== 'rejected') {
        void fetchRequests();
      }
    }
  }, [now, requests, fetchRequests]);

  // Check if the most recent request was rejected (e.g. no driver accepted within 1 min)
  const mostRecent = requests[0];
  const recentRejected =
    mostRecent &&
    mostRecent.status.toLowerCase() === 'rejected' &&
    mostRecent.id !== dismissedRejectionId &&
    now - new Date(mostRecent.createdAt).getTime() < 15 * 60 * 1000 // Displayed within 15 min of creation
      ? mostRecent
      : null;

  // 1. If the request was rejected (e.g. driver didn't accept within 1 minute)
  if (!currentSosRequest && !currentHold && recentRejected) {
    const rejectionNote =
      recentRejected.rejectionReason || 'No driver accepted the request within 1 minute.';
    return (
      <section
        className="mb-6 rounded-3xl border border-rose-200 bg-rose-50/50 p-5 sm:p-6 shadow-xs transition-all"
        aria-live="polite"
      >
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-xs">
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  Request Rejected
                </span>
                <span className="font-mono text-xs text-slate-500">
                  Ref: #{recentRejected.id.slice(0, 8)}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(recentRejected.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                Request rejected: Any driver did not accept the request
              </h2>
              <p className="text-xs sm:text-sm text-rose-800 mt-0.5 max-w-xl font-medium">
                {rejectionNote} The 1-minute acceptance window expired and the request has been closed from the backend.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setDismissedRejectionId(recentRejected.id)}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('driver-request')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 transition shadow-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry Request</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 2. Active Request Status: If there is an active hold (or bed request)
  if (!currentSosRequest && currentHold) {
    const isConfirmed = currentHold.status === 'confirmed';
    const isQueued = currentHold.status === 'queued';
    const statusLabel = isConfirmed
      ? 'Confirmed'
      : isQueued
      ? `In Queue · Position #${currentHold.queuePosition ?? 1}`
      : 'Pending Confirmation';

    const badgeBg = isConfirmed
      ? 'bg-[#2E7D4F] text-white border-transparent'
      : 'bg-[#C98A1F] text-white border-transparent';

    return (
      <section
        className="mb-6 rounded-3xl p-5 sm:p-6 shadow-sm transition-all bg-[#1E5A8E] text-white"
        aria-label="Emergency Request"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
              <BedDouble className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-200">
                  Emergency Request
                </span>
                <span className="font-mono text-xs text-sky-100">
                  Ref #{currentHold.id.slice(0, 8)}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeBg}`}>
                  {statusLabel}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white mt-1">
                {currentHold.hospitalName || 'Hospital Bed Request'}
              </h2>
              <p className="text-xs sm:text-sm text-sky-100 mt-0.5 max-w-xl">
                Requested at {new Date(currentHold.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {currentHold.notes ? ` · Note: “${currentHold.notes}”` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchRequests()}
              className="p-2 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition"
              title="Refresh request status"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 3. Active SOS or Driver Transport Request
  if (currentSosRequest) {
    const isRoutine = currentSosRequest.requestType === 'routine';
    const hospital = currentSosRequest.hospitalRequest;
    const hospitalAccepted = hospital?.status === 'accepted';
    const driverAccepted = currentSosRequest.status === 'accepted' && currentSosRequest.driverAssigned !== false;
    const driverArrived = Boolean(currentSosRequest.arrivedAt);
    const isSearching = currentSosRequest.status.toLowerCase() === 'searching';

    const elapsedSeconds = Math.floor((now - new Date(currentSosRequest.createdAt).getTime()) / 1000);
    const secondsLeft = Math.max(0, 60 - elapsedSeconds);

    const statusText = driverArrived
      ? 'Driver Arrived at Your Location'
      : driverAccepted
      ? 'Driver Dispatched · En Route'
      : `Searching for Available Driver (${secondsLeft}s left)`;

    const isConfirmedStatus = driverArrived || driverAccepted;
    const statusBadge = (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
          isConfirmedStatus
            ? 'bg-[#2E7D4F] text-white'
            : 'bg-[#C98A1F] text-white'
        }`}
      >
        <Clock className="h-3.5 w-3.5" />
        {statusText}
      </span>
    );

    return (
      <section
        className="mb-6 rounded-3xl p-5 sm:p-6 shadow-sm bg-[#1E5A8E] text-white"
        aria-live="polite"
      >
        {/* Box Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
              {isRoutine ? <Car className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Emergency Request</h2>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live
                </span>
              </div>
              <p className="text-xs text-sky-100">
                Ref: <span className="font-mono font-medium">{currentSosRequest.id.slice(0, 10)}</span> ·{' '}
                {new Date(currentSosRequest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {hospital?.hospitalName ? ` · ${hospital.hospitalName}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {statusBadge}
            <button
              type="button"
              onClick={() => void fetchRequests()}
              className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition"
              title="Refresh current status"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Main Request Content */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Driver Progress Card */}
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="flex items-center justify-between text-xs text-sky-100 font-medium mb-2">
              <span className="flex items-center gap-1.5">
                <Car className="h-4 w-4 text-sky-200" />
                Driver Dispatch
              </span>
              <span className="font-semibold text-white">
                {isRoutine ? 'Routine Transport' : 'Emergency Ambulance'}
              </span>
            </div>
            <p className="font-bold text-white text-sm">{currentSosRequest.incidentType}</p>
            <p className="mt-2 text-xs text-sky-100 flex items-center gap-1.5">
              {driverAccepted ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" />
              ) : (
                <Clock className="h-4 w-4 text-amber-200 shrink-0" />
              )}
              {driverAccepted
                ? `Driver accepted your request and is heading to your coordinates.`
                : isSearching
                ? `Transmitting details to nearest drivers. Auto-rejects if not accepted within ${secondsLeft}s.`
                : `Waiting for pickup confirmation.`}
            </p>
            {currentSosRequest.acceptedAt && (
              <p className="mt-1 text-[11px] text-sky-200">
                Accepted at {new Date(currentSosRequest.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          {/* Hospital or Destination Status Card */}
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="flex items-center justify-between text-xs text-sky-100 font-medium mb-2">
              <span className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-rose-300" />
                {isRoutine ? 'Destination Details' : 'Hospital Coordination'}
              </span>
              <span className="font-semibold text-white">
                {hospital ? hospital.status.toUpperCase() : 'In Progress'}
              </span>
            </div>

            {hospital ? (
              <div>
                <p className="font-bold text-white text-sm">{hospital.hospitalName}</p>
                <p className="mt-2 text-xs text-sky-100 flex items-center gap-1.5">
                  {hospitalAccepted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-200 shrink-0" />
                  )}
                  {hospitalAccepted
                    ? `Facility accepted the intake request.`
                    : hospital.status === 'rejected'
                    ? `Hospital declined intake request (at full capacity).`
                    : `Waiting for triage confirmation from hospital desk…`}
                </p>
                {hospitalAccepted && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-white">
                    {hospital.bedCategory && (
                      <span className="inline-flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-md">
                        <BedDouble className="h-3 w-3" />
                        {hospital.bedCategory.toUpperCase()} Reserved
                      </span>
                    )}
                    {hospital.requiredSpecialty && (
                      <span className="inline-flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-md">
                        <Stethoscope className="h-3 w-3" />
                        {hospital.requiredSpecialty}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="font-bold text-white text-sm">
                  {isRoutine ? 'Scheduled Non-Emergency Trip' : 'Direct Paramedic Assistance'}
                </p>
                <p className="mt-2 text-xs text-sky-100">
                  {isRoutine
                    ? 'Your pickup is assigned to medical drivers in your area.'
                    : 'Hospital reservation is optional for this incident or being verified by dispatcher.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // 4. Empty state: NO current request right now
  return (
    <section
      className="mb-6 rounded-3xl border border-[#D8DEE2] bg-[#E6EEF5] text-[#1B1F23] p-5 sm:p-6 shadow-xs transition-all"
      aria-label="Emergency Request"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#D8DEE2] text-[#1B1F23]">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Emergency Request
            </span>
            <h2 className="text-base sm:text-lg font-bold text-[#1B1F23] mt-1">
              No current request right now
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5 max-w-xl">
              You do not have any active emergency response, bed holds, or transport requests in progress.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
