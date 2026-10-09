'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
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
  XCircle,
  X,
} from 'lucide-react';

export type PatientRequest = {
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
  notes?: string;
  rejectionReason?: string;
  requiredEquipment?: string[];
  hospitalRequest: null | {
    status: string;
    hospitalName: string;
    acceptedAt?: string;
    bedCategory?: string;
    requiredSpecialty?: string;
  };
};

export type PatientBedHold = {
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

export const PatientEmergencyRequestsView: React.FC = () => {
  const { setActiveTab } = useCareLink();
  const [requests, setRequests] = useState<PatientRequest[]>([]);
  const [holds, setHolds] = useState<PatientBedHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingHoldId, setCancellingHoldId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const [resSos, resHolds] = await Promise.all([
        fetch('/api/sos', { cache: 'no-store' }),
        fetch('/api/holds/mine', { cache: 'no-store' }),
      ]);

      const dataSos = await resSos.json();
      if (!resSos.ok) throw new Error(dataSos.error || 'Failed to load requests');
      setRequests(dataSos.requests ?? []);

      if (resHolds.ok) {
        const dataHolds = await resHolds.json();
        setHolds(dataHolds.holds ?? []);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRequests();
    const interval = window.setInterval(fetchRequests, 6000);
    window.addEventListener('carelink-sos-updated', fetchRequests);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('carelink-sos-updated', fetchRequests);
    };
  }, [fetchRequests]);

  const handleCancelHold = async (holdId: string) => {
    if (!window.confirm('Are you sure you want to cancel this bed request?')) return;
    setCancellingHoldId(holdId);
    try {
      const res = await fetch(`/api/holds/${encodeURIComponent(holdId)}/cancel`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel request');
      await fetchRequests();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not cancel request');
    } finally {
      setCancellingHoldId(null);
    }
  };

  const filteredSos = requests.filter((r) => {
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

  const filteredHolds = holds.filter((h) => {
    const isCompleted = ['cancelled', 'expired', 'rejected'].includes(h.status);
    if (statusFilter === 'active' && isCompleted) return false;
    if (statusFilter === 'completed' && !isCompleted) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = h.id.toLowerCase().includes(q);
      const matchHosp = (h.hospitalName || '').toLowerCase().includes(q);
      if (!matchId && !matchHosp) return false;
    }
    return true;
  });

  const activeSosCount = requests.filter(
    (r) => !['completed', 'cancelled', 'rejected'].includes(r.status.toLowerCase())
  ).length;

  const activeHoldsCount = holds.filter(
    (h) => ['queued', 'pending', 'confirmed'].includes(h.status)
  ).length;

  const totalActiveCount = activeSosCount + activeHoldsCount;
  const totalCount = requests.length + holds.length;

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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-white rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Requests ({totalCount})
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
            {totalActiveCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusFilter === 'active' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'}`}>
                {totalActiveCount}
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

      {/* Bed Holds Section */}
      {filteredHolds.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-sky-700" />
            Hospital Bed Requests ({filteredHolds.length})
          </h2>
          <div className="space-y-3">
            {filteredHolds.map((hold) => {
              const isActive = ['queued', 'pending', 'confirmed'].includes(hold.status);
              const isConfirmed = hold.status === 'confirmed';
              const isQueued = hold.status === 'queued';
              const isPending = hold.status === 'pending';
              const isRejected = hold.status === 'rejected';

              const statusBadgeClass = isConfirmed
                ? 'bg-[#2E7D4F] text-white'
                : isQueued || isPending
                ? 'bg-[#C98A1F] text-white'
                : isRejected
                ? 'bg-[#C0362C] text-white'
                : 'bg-slate-100 text-slate-700 border border-slate-200';

              const statusLabel = isConfirmed
                ? 'Bed Confirmed'
                : isQueued
                ? `In Queue · Position #${hold.queuePosition ?? 1}`
                : isPending
                ? 'Request Pending'
                : isRejected
                ? 'Rejected'
                : hold.status.charAt(0).toUpperCase() + hold.status.slice(1);

              return (
                <article
                  key={hold.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                        <BedDouble className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700">
                            Hospital Bed Hold
                          </span>
                          <span className="font-mono text-xs text-slate-500">
                            #{hold.id.slice(0, 8)}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 mt-0.5">
                          {hold.hospitalName || 'Hospital Bed'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Requested on {new Date(hold.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusBadgeClass}`}>
                        <Clock className="h-3.5 w-3.5" />
                        {statusLabel}
                      </span>
                      {isActive && (
                        <button
                          type="button"
                          disabled={cancellingHoldId === hold.id}
                          onClick={() => void handleCancelHold(hold.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                          <span>{cancellingHoldId === hold.id ? 'Cancelling…' : 'Cancel'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {hold.notes && (
                    <div className="mt-3 pt-2 text-xs text-slate-600 italic">
                      <span className="font-semibold not-italic text-slate-700">Notes:</span> “{hold.notes}”
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* SOS / Ambulance Requests List */}
      <div className="space-y-3">
        {filteredSos.length > 0 && holds.length > 0 && (
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Car className="h-4 w-4 text-rose-700" />
            Ambulance & Transport Requests ({filteredSos.length})
          </h2>
        )}

        {filteredSos.length === 0 && filteredHolds.length === 0 ? (
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
            {filteredSos.map((request) => {
              const isRoutine = request.requestType === 'routine';
              const hospital = request.hospitalRequest;
              const hospitalAccepted = hospital?.status === 'accepted';
              const driverAccepted = request.status === 'accepted' && request.driverAssigned !== false;
              const driverCompleted = request.status === 'completed';
              const requestCancelled = request.status === 'cancelled';
              const requestRejected = request.status === 'rejected';
              const driverArrived = Boolean(request.arrivedAt);

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
                ? 'bg-[#C0362C] text-white'
                : driverAccepted && !driverCompleted
                ? 'bg-[#2E7D4F] text-white'
                : driverCompleted
                ? 'bg-[#2E7D4F] text-white'
                : requestCancelled
                ? 'bg-slate-100 text-slate-700 border-slate-200'
                : 'bg-[#C98A1F] text-white';

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
                        <p className="text-xs text-slate-400 mt-0.5">
                          Created on {new Date(request.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${driverStatusClass}`}>
                      <Clock className="h-3.5 w-3.5" />
                      {driverStatus}
                    </span>
                  </div>

                  {/* Body grid */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Driver details card */}
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Car className="h-4 w-4 text-sky-600" />
                          Driver Assignment
                        </span>
                        <span className="font-semibold text-slate-700">
                          {isRoutine ? 'Routine Driver' : 'Emergency Ambulance'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {driverCompleted
                          ? 'This transport operation has completed successfully.'
                          : requestRejected
                          ? request.rejectionReason || 'No driver accepted within the 1-minute window.'
                          : requestCancelled
                          ? 'This request was cancelled by the requester or dispatcher.'
                          : driverArrived
                          ? 'The driver has arrived at your designated location.'
                          : driverAccepted
                          ? 'A driver accepted your assignment and is currently navigating towards you.'
                          : 'Currently searching for available drivers nearby…'}
                      </p>
                      {request.acceptedAt && (
                        <p className="mt-2 text-[11px] text-slate-400">
                          Accepted at {new Date(request.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>

                    {/* Hospital Intake card */}
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <BedDouble className="h-4 w-4 text-rose-600" />
                          Destination Facility
                        </span>
                        <span className="font-semibold text-slate-700">
                          {hospital ? hospital.status.toUpperCase() : 'Not Requested'}
                        </span>
                      </div>
                      {hospital ? (
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{hospital.hospitalName}</p>
                          <p className="mt-1 text-xs text-slate-600">
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
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
