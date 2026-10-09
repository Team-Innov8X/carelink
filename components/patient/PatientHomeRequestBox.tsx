'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import {
  Activity,
  Bookmark,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Car,
  BedDouble,
  Stethoscope,
  MapPin,
  RefreshCw,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Sparkles,
} from '../icons';

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

export const PatientHomeRequestBox: React.FC = () => {
  const { setActiveTab } = useCareLink();
  const [requests, setRequests] = useState<PatientRequestSummary[]>([]);
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
      const res = await fetch('/api/sos', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not fetch requests');
      setRequests(data.requests ?? []);
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
  const currentRequest = requests.find((r) => {
    const status = r.status.toLowerCase();
    if (['completed', 'cancelled', 'rejected'].includes(status)) return false;
    if (status === 'searching') {
      const elapsed = now - new Date(r.createdAt).getTime();
      return elapsed < 60000; // Only valid within 60 seconds
    }
    return true; // accepted / en route
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
  if (!currentRequest && recentRejected) {
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
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
            >
              <span>View History ({requests.length})</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 2. If there is NO active request right now, show the Bookmark card
  if (!currentRequest) {
    return (
      <section
        className="mb-6 rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs transition-all"
        aria-label="Current Request Status"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Bookmark className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Bookmark · Standby
                </span>
                <span className="text-xs text-slate-400">All systems normal</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                No current request right now
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 max-w-xl">
                You do not have any active emergency response or medical transport requests in progress.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('triage')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>AI Symptom Triage</span>
            </button>
            {requests.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition-colors"
              >
                <span>View Past Requests ({requests.length})</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('driver-request')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 transition-colors shadow-xs"
            >
              <Car className="h-3.5 w-3.5" />
              <span>Book Routine Driver</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 3. When there IS an active current request (only one shown):
  const isRoutine = currentRequest.requestType === 'routine';
  const hospital = currentRequest.hospitalRequest;
  const hospitalAccepted = hospital?.status === 'accepted';
  const driverAccepted = currentRequest.status === 'accepted' && currentRequest.driverAssigned !== false;
  const driverArrived = Boolean(currentRequest.arrivedAt);
  const isSearching = currentRequest.status.toLowerCase() === 'searching';

  // Calculate remaining seconds if searching
  const elapsedSeconds = Math.floor((now - new Date(currentRequest.createdAt).getTime()) / 1000);
  const secondsLeft = Math.max(0, 60 - elapsedSeconds);

  const statusText = driverArrived
    ? 'Driver Arrived at Your Location'
    : driverAccepted
    ? 'Driver Dispatched · En Route'
    : `Searching for Available Driver (${secondsLeft}s left)`;

  const badgeStyle = driverArrived
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : driverAccepted
    ? 'bg-sky-100 text-sky-800 border-sky-200'
    : 'bg-amber-100 text-amber-800 border-amber-200';

  return (
    <section
      className={`mb-6 rounded-3xl border ${
        isRoutine ? 'border-sky-200 bg-sky-50/30' : 'border-rose-200 bg-rose-50/20'
      } bg-white p-5 sm:p-6 shadow-sm`}
      aria-live="polite"
    >
      {/* Box Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
              isRoutine ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'
            }`}
          >
            {isRoutine ? <Car className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Current Active Request</h2>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Ref: <span className="font-mono font-medium text-slate-700">{currentRequest.id.slice(0, 10)}</span> ·{' '}
              {new Date(currentRequest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badgeStyle}`}>
            <Clock className="h-3.5 w-3.5" />
            {statusText}
          </span>
          <button
            type="button"
            onClick={() => void fetchRequests()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            title="Refresh current status"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Request Content */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Driver Progress Card */}
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span className="flex items-center gap-1.5">
              <Car className="h-4 w-4 text-sky-600" />
              Driver Dispatch
            </span>
            <span className="font-semibold text-slate-700">
              {isRoutine ? 'Routine Transport' : 'Emergency Ambulance'}
            </span>
          </div>
          <p className="font-bold text-slate-900 text-sm">{currentRequest.incidentType}</p>
          <p className="mt-2 text-xs text-slate-600 flex items-center gap-1.5">
            {driverAccepted ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            {driverAccepted
              ? `Driver accepted your request and is heading to your coordinates.`
              : isSearching
              ? `Transmitting details to nearest drivers. Auto-rejects if not accepted within ${secondsLeft}s.`
              : `Waiting for pickup confirmation.`}
          </p>
          {currentRequest.acceptedAt && (
            <p className="mt-1 text-[11px] text-slate-400">
              Accepted at {new Date(currentRequest.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Hospital or Destination Status Card */}
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-rose-600" />
              {isRoutine ? 'Destination Details' : 'Hospital Coordination'}
            </span>
            <span className="font-semibold text-slate-700">
              {hospital ? hospital.status.toUpperCase() : 'In Progress'}
            </span>
          </div>

          {hospital ? (
            <div>
              <p className="font-bold text-slate-900 text-sm">{hospital.hospitalName}</p>
              <p className="mt-2 text-xs text-slate-600 flex items-center gap-1.5">
                {hospitalAccepted ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                )}
                {hospitalAccepted
                  ? `Facility accepted the intake request.`
                  : hospital.status === 'rejected'
                  ? `Hospital declined intake request (at full capacity).`
                  : `Waiting for triage confirmation from hospital desk…`}
              </p>
              {hospitalAccepted && (
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-emerald-800">
                  {hospital.bedCategory && (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 px-2 py-0.5 rounded-md">
                      <BedDouble className="h-3 w-3" />
                      {hospital.bedCategory.toUpperCase()} Reserved
                    </span>
                  )}
                  {hospital.requiredSpecialty && (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 px-2 py-0.5 rounded-md">
                      <Stethoscope className="h-3 w-3" />
                      {hospital.requiredSpecialty}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="font-bold text-slate-900 text-sm">
                {isRoutine ? 'Scheduled Non-Emergency Trip' : 'Direct Paramedic Assistance'}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                {isRoutine
                  ? 'Your pickup is assigned to medical drivers in your area.'
                  : 'Hospital reservation is optional for this incident or being verified by dispatcher.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Box Footer Action to View All Requests */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          Want to see all past and ongoing requests?
        </span>
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className="inline-flex items-center gap-1.5 font-bold text-sky-600 hover:text-sky-700 hover:underline"
        >
          <span>View all emergency requests ({requests.length})</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
};
