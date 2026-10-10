'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { DelayedSkeleton, RequestListSkeleton } from '../common/Skeletons';
import { fetchPatientSosRequests } from '../../lib/client-sos';
import {
  Siren,
  Search,
  Car,
  CheckCircle2,
  Clock,
  BedDouble,
  Stethoscope,
  ShieldAlert,
  RefreshCw,
  AlertCircle,
} from '../icons';

export type PatientRequest = {
  id: string;
  status: string;
  incidentType: string;
  createdAt: string;
  acceptedAt?: string;
  arrivedAt?: string | null;
  completedAt?: string;
  driverAssigned?: boolean;
  tripStage?: string;
  requestType?: 'emergency' | 'routine';
  patientPhone?: string;
  passengerName?: string;
  preferredTime?: string;
  notes?: string;
  rejectionReason?: string;
  requiredEquipment?: string[];
  driver?: { name?: string; vehicleNumber?: string; ambulanceType?: string | null; location?: { latitude: number; longitude: number } | null } | null;
  hospitalRequest: null | {
    status: string;
    hospitalName: string;
    acceptedAt?: string;
    bedCategory?: string;
    requiredSpecialty?: string;
  };
};

export const PatientEmergencyRequestsView: React.FC = () => {
  const { setActiveTab } = useCareLink();
  const [requests, setRequests] = useState<PatientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const requestInFlight = useRef(false);
  const [cancellingId, setCancellingId] = useState('');
  const [cancelMessage, setCancelMessage] = useState('');

  const fetchRequests = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const res = await fetch('/api/sos', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load requests');
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch requests');
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, []);

  const cancelRequest = async (requestId: string) => {
    if (!window.confirm('Cancel this SOS request? The request will remain in your history.')) return;
    setCancellingId(requestId);
    setCancelMessage('');
    try {
      const response = await fetch(`/api/sos/${encodeURIComponent(requestId)}/cancel`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not cancel this SOS request.');
      setCancelMessage('SOS request cancelled. It remains in your request history.');
      window.dispatchEvent(new Event('carelink-sos-updated'));
      await fetchRequests();
    } catch (cause) {
      setCancelMessage(cause instanceof Error ? cause.message : 'Could not cancel this SOS request.');
    } finally {
      setCancellingId('');
    }
  };

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchRequests(), 0);
    const interval = window.setInterval(fetchRequests, 6000);
    window.addEventListener('carelink-sos-updated', fetchRequests);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener('carelink-sos-updated', fetchRequests);
    };
  }, [fetchRequests]);

  const filtered = requests.filter((r) => {
    const isCompleted = ['completed', 'cancelled', 'rejected'].includes(r.status.toLowerCase());
    if (statusFilter === 'active' && isCompleted) return false;
    if (statusFilter === 'completed' && !isCompleted) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = r.id.toLowerCase().includes(q);
      const matchIncident = r.incidentType.toLowerCase().includes(q);
      const matchHosp = r.hospitalRequest?.hospitalName.toLowerCase().includes(q);
      if (!matchId && !matchIncident && !matchHosp) return false;
    }
    return true;
  });

  const activeCount = requests.filter(
    (r) => !['completed', 'cancelled', 'rejected'].includes(r.status.toLowerCase())
  ).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-xs">
              <Siren className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Emergency & Transport Requests
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Complete record of your active dispatches, hospital reservations, and routine transport requests.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('driver-request')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 transition shadow-xs"
          >
            <Car className="h-4 w-4" />
            <span>Book Routine Driver</span>
          </button>
          <button
            type="button"
            onClick={() => void fetchRequests()}
            className="p-2.5 rounded-xl text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition shadow-xs"
            title="Refresh requests"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      {cancelMessage && <p role="status" className="text-sm text-slate-700">{cancelMessage}</p>}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Requests ({requests.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              statusFilter === 'active'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Active</span>
            {activeCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusFilter === 'active' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'}`}>
                {activeCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'completed'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Completed / Closed
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ID, hospital, or issue…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Requests List */}
      {loading ? <DelayedSkeleton><RequestListSkeleton /></DelayedSkeleton> : filtered.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-3xl border border-slate-200 shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
            <Siren className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {searchQuery ? 'No matching requests found' : 'No requests in this view'}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? 'Try modifying your search keywords or clear your active filters.'
              : 'You have not submitted any emergency or driver requests in this category yet.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('driver-request')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 transition"
            >
              Book Routine Driver
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((request) => {
            const isRoutine = request.requestType === 'routine';
            const hospital = request.hospitalRequest;
            const hospitalAccepted = hospital?.status === 'accepted';
            const driverAccepted = request.status === 'accepted' && request.driverAssigned !== false;
            const driverCompleted = request.status === 'completed';
            const requestCancelled = request.status === 'cancelled';
            const requestRejected = request.status === 'rejected' || request.status === 'no_driver_found';
            const driverArrived = Boolean(request.arrivedAt);
            const pickupStarted = ['patient_on_board', 'en_route_hospital', 'arrived_hospital', 'handover_complete'].includes(request.tripStage || '');
            const canCancel = !isRoutine && ['searching', 'accepted'].includes(request.status.toLowerCase()) && !pickupStarted;

            const driverStatus = driverCompleted
              ? 'Driver response completed'
              : requestRejected
              ? 'Request rejected · No driver accepted'
              : requestCancelled
              ? 'Request closed'
              : driverArrived
              ? 'Driver arrived on site'
              : driverAccepted
              ? 'Driver accepted · en route'
              : 'Searching for driver';

            const driverStatusClass = requestRejected
              ? 'bg-rose-100 text-rose-800 border-rose-200'
              : driverAccepted && !driverCompleted
              ? 'bg-sky-100 text-sky-800 border-sky-200'
              : driverCompleted
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : requestCancelled
              ? 'bg-slate-100 text-slate-700 border-slate-200'
              : 'bg-amber-100 text-amber-800 border-amber-200';

            return (
              <article
                key={request.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                        isRoutine ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {isRoutine ? <Car className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isRoutine ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {isRoutine ? 'Routine Transport' : 'Emergency SOS'}
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          #{request.id.slice(0, 8)}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-0.5">
                        {request.incidentType}
                      </h3>
                      {request.requestType === 'routine' && <p className="mt-1 text-xs text-slate-600">Passenger: {request.passengerName || 'Patient'}{request.patientPhone ? ` · ${request.patientPhone}` : ''}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">
                        Created on {new Date(request.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${driverStatusClass}`}>
                    {driverCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    {driverStatus}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Driver dispatch box */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Car className="h-4 w-4 text-sky-600" />
                        Driver & Vehicle Status
                      </span>
                      <span>{driverCompleted ? 'Completed' : driverAccepted ? 'Dispatched' : 'Pending'}</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {requestRejected
              ? request.status === 'no_driver_found' ? 'No nearby driver accepted this request.' : request.rejectionReason || 'No driver accepted the request.'
                        : driverAccepted
                        ? `An emergency driver accepted your request${request.acceptedAt ? ` at ${new Date(request.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}.`
                        : driverCompleted
                        ? 'The driver has safely concluded this medical response.'
                        : requestCancelled
                        ? 'This request was closed.'
                        : 'Dispatched into CareLink network. Awaiting pickup confirmation.'}
                    </p>
                    {request.driverAssigned && <p className="mt-2 text-xs font-semibold text-emerald-800">{request.driver?.name ?? 'Driver assigned'}{request.driver?.vehicleNumber ? ` · ${request.driver.vehicleNumber}` : ' · Vehicle details pending'}{request.driver?.ambulanceType ? ` · ${request.driver.ambulanceType}` : ''}</p>}
                    {request.preferredTime && (
                      <p className="mt-2 text-[11px] font-medium text-slate-500 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        Target Time: {request.preferredTime}
                      </p>
                    )}
                  </div>

                  {/* Hospital or Facility box */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <BedDouble className="h-4 w-4 text-rose-600" />
                        Hospital Allocation
                      </span>
                      <span>{hospital ? hospital.status.toUpperCase() : 'N/A'}</span>
                    </div>

                    {hospital ? (
                      <div>
                        <p className="text-xs font-bold text-slate-900">{hospital.hospitalName}</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {hospitalAccepted
                            ? `Intake accepted${hospital.acceptedAt ? ` at ${new Date(hospital.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}.`
                            : hospital.status === 'rejected'
                            ? 'Facility currently at full capacity; re-routing…'
                            : 'Reviewing intake capacity and triage desk…'}
                        </p>
                        {hospitalAccepted && (
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-emerald-800">
                            {hospital.bedCategory && (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 px-2 py-0.5 rounded-md">
                                <BedDouble className="h-3 w-3" />
                                {hospital.bedCategory.toUpperCase()} Bed
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
                      <p className="text-xs text-slate-600">
                        {isRoutine
                          ? 'Direct medical transit. No immediate hospital triage bed required.'
                          : 'Hospital triage is optional or handled directly by ambulance staff.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Optional Patient Notes or Equipment Tag */}
                {(request.notes || (request.requiredEquipment && request.requiredEquipment.length > 0)) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    {request.notes && (
                      <p className="text-slate-600 italic">
                        <span className="font-semibold not-italic text-slate-700">Notes:</span> “{request.notes}”
                      </p>
                    )}
                    {request.requiredEquipment && request.requiredEquipment.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-slate-500">Equipment:</span>
                        {request.requiredEquipment.map((eq) => (
                          <span key={eq} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                            {eq}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {canCancel && (
                  <div className="mt-4 flex justify-end">
                    <button type="button" onClick={() => void cancelRequest(request.id)} disabled={cancellingId === request.id}
                      className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                      {cancellingId === request.id ? 'Cancelling…' : 'Cancel SOS'}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
