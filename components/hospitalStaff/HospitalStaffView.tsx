import React, { useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { HospitalBeds } from '../../types';
import {
  Building2,
  Clock,
  Check,
  X,
  Plus,
  Minus,
  AlertTriangle,
  User,
  Activity,
  HeartPulse,
  ShieldCheck,
} from 'lucide-react';

export const HospitalStaffView: React.FC = () => {
  const {
    hospitals,
    emergencies,
    acceptEmergency,
    rejectEmergency,
    updateBedCounts,
    setActiveTab,
    setSelectedEmergencyId,
  } = useCareLink();

  const [activeQueueTab, setActiveQueueTab] = useState<'pending' | 'accepted' | 'completed'>(
    'pending'
  );

  // This workspace is fixed to its assigned hospital; it cannot switch facilities.
  const currentHospital = hospitals[0];

  // Filter requests destined for or pending with this hospital
  const pendingRequests = emergencies.filter(
    (e) =>
      (e.assignedHospitalId === currentHospital.id || !e.assignedHospitalId) &&
      (e.status === 'Pending' || e.status === 'Finding hospital')
  );

  const acceptedRequests = emergencies.filter(
    (e) =>
      e.assignedHospitalId === currentHospital.id &&
      (e.status === 'Assigned' || e.status === 'En Route')
  );

  const completedRequests = emergencies.filter(
    (e) => e.assignedHospitalId === currentHospital.id && e.status === 'Completed'
  );

  const handleAccept = (reqId: string) => {
    acceptEmergency(reqId);
    setSelectedEmergencyId(reqId);
    setActiveTab('handoff');
  };

  const handleReject = (reqId: string) => {
    const reason = prompt('Please enter reason for re-routing (e.g. ICU bed at max capacity):', 'All Trauma Bays Occupied');
    if (reason !== null) {
      rejectEmergency(reqId, reason);
    }
  };

  const bedConfigs: { key: keyof HospitalBeds; label: string; color: string }[] = [
    { key: 'general', label: 'General Beds', color: 'text-sky-700 bg-sky-50 border-sky-200' },
    { key: 'icu', label: 'ICU Beds', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { key: 'trauma', label: 'Trauma Beds', color: 'text-rose-700 bg-rose-50 border-rose-200' },
    { key: 'ventilators', label: 'Ventilators', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Hospital Top Bar Header (Mockup Panel 5) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-extrabold text-xl flex items-center justify-center shadow-md shadow-emerald-200">
            H
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{currentHospital.name}</h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                Staff Triage Portal
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentHospital.location.address} • Hotline: {currentHospital.phone}
            </p>
          </div>
        </div>

      </div>

      {/* Current Bed Availability (Mockup Panel 5 bottom) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Current Bed Availability</h2>
            <p className="text-xs text-slate-500">
              Live capacity feeds updated instantly to regional dispatchers and 112 emergency calls
            </p>
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            Auto-Sync Live
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {bedConfigs.map(({ key, label, color }) => {
            const bed = currentHospital.beds[key];
            const isLow = bed.available <= 1;

            return (
              <div
                key={key}
                className={`rounded-2xl p-4 border transition-all ${color} flex flex-col justify-between`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
                  {isLow && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-600 text-white animate-pulse">
                      CRITICAL
                    </span>
                  )}
                </div>

                <div className="my-3 flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-extrabold tracking-tight">{bed.available}</span>
                  <span className="text-base font-medium opacity-60">/{bed.total}</span>
                </div>

                {/* Instant +/- adjustments for Hospital Triage */}
                <div className="flex items-center justify-center gap-2 pt-2 border-t border-black/5">
                  <button
                    onClick={() => updateBedCounts(currentHospital.id, key, -1)}
                    disabled={bed.available <= 0}
                    className="w-8 h-8 rounded-lg bg-white/80 hover:bg-white text-slate-800 disabled:opacity-40 disabled:hover:bg-white/80 font-bold flex items-center justify-center shadow-2xs transition-all active:scale-95"
                    title={`Admit patient / decrement ${label}`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-semibold opacity-70">Adjust</span>
                  <button
                    onClick={() => updateBedCounts(currentHospital.id, key, 1)}
                    disabled={bed.available >= bed.total}
                    className="w-8 h-8 rounded-lg bg-white/80 hover:bg-white text-slate-800 disabled:opacity-40 disabled:hover:bg-white/80 font-bold flex items-center justify-center shadow-2xs transition-all active:scale-95"
                    title={`Discharge patient / increment ${label}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Incoming Patient Requests Queue (Mockup Panel 5) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Incoming Patient Requests</h2>
            <p className="text-xs text-slate-500">
              Paramedic ambulance requests requiring ER bed approval
            </p>
          </div>

          {/* Tabs: Pending (2), Accepted (1), Completed (5) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveQueueTab('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeQueueTab === 'pending'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Pending ({pendingRequests.length})
            </button>
            <button
              onClick={() => setActiveQueueTab('accepted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeQueueTab === 'accepted'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Accepted ({acceptedRequests.length})
            </button>
            <button
              onClick={() => setActiveQueueTab('completed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeQueueTab === 'completed'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Completed ({completedRequests.length})
            </button>
          </div>
        </div>

        {/* Requests Table */}
        {activeQueueTab === 'pending' && (
          <div className="overflow-x-auto">
            {pendingRequests.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No pending ambulance requests at this moment.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="pb-3 px-3">Patient</th>
                    <th className="pb-3 px-3">Type</th>
                    <th className="pb-3 px-3">Priority</th>
                    <th className="pb-3 px-3">ETA</th>
                    <th className="pb-3 px-3">Vitals & Notes</th>
                    <th className="pb-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-900">{req.id}</div>
                        <div className="text-[11px] text-slate-500">
                          {req.patientName} ({req.age}y, {req.gender})
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-semibold text-slate-800">{req.condition}</span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-rose-100 text-rose-700 border border-rose-200">
                          {req.priority}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-emerald-600 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{req.currentEtaMin || 8} min</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="text-[11px] text-slate-600">
                          BP: <b>{req.vitals.bp}</b> • HR: <b>{req.vitals.heartRate} bpm</b> • SpO2:{' '}
                          <b>{req.vitals.spO2}%</b>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                          {req.vitals.conditionNotes}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleAccept(req.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors shadow-xs flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept</span>
                          </button>
                          <button
                            onClick={() => handleReject(req.id)}
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg transition-colors border border-rose-200 flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Accepted tab */}
        {activeQueueTab === 'accepted' && (
          <div className="space-y-3">
            {acceptedRequests.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No active en-route patients.
              </div>
            ) : (
              acceptedRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-sm">
                      🚑
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{req.id}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {req.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">
                        {req.condition} • Ambulance: {req.assignedAmbulanceId || 'A-12'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedEmergencyId(req.id);
                      setActiveTab('handoff');
                    }}
                    className="px-4 py-2 bg-slate-900 text-white font-semibold text-xs rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    Open Live Handoff
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Completed tab */}
        {activeQueueTab === 'completed' && (
          <div className="space-y-2">
            {completedRequests.map((req) => (
              <div
                key={req.id}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-800">{req.id}</span> • {req.patientName} (
                  {req.condition})
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                  Admitted & Bed Allocated
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
