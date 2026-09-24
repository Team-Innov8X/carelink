import React from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { MapView } from '../common/MapView';
import {
  Building2,
  Ambulance as AmbulanceIcon,
  Pill,
  ArrowRight,
  Sparkles,
  MapPin,
  Clock,
  ChevronRight,
} from 'lucide-react';

export const DispatcherDashboard: React.FC = () => {
  const {
    emergencies,
    hospitals,
    ambulances,
    medicines,
    setSelectedEmergencyId,
    setActiveTab,
  } = useCareLink();

  const availableHospitals = hospitals.filter((h) => h.status === 'Available');
  const onDutyAmbulances = ambulances.filter(
    (a) => a.status === 'On Duty' || a.status === 'En Route'
  );
  const unavailableMedicines = medicines.filter((m) =>
    Object.values(m.stock).some((qty) => qty === 0)
  );

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Critical':
      case 'High':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'Medium':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Low':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Finding hospital':
        return 'bg-purple-100 text-purple-700';
      case 'Pending':
        return 'bg-amber-100 text-amber-700';
      case 'Assigned':
        return 'bg-blue-100 text-blue-700';
      case 'En Route':
        return 'bg-emerald-100 text-emerald-700 font-bold animate-pulse';
      case 'Completed':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const handlePatientSelect = (patientId: string) => {
    setSelectedEmergencyId(patientId);
    setActiveTab('recommendations');
  };

  const handleHandoffSelect = (patientId: string) => {
    setSelectedEmergencyId(patientId);
    setActiveTab('handoff');
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          CareLink Response Network
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here's the current status of hospitals, ambulances and requests.
        </p>
      </div>

      {/* Network status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 2: Available Hospitals */}
        <div
          onClick={() => setActiveTab('hospitals')}
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Available Hospitals
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600 tracking-tight">
              {availableHospitals.length}
            </span>
            <span className="text-xs font-semibold text-emerald-600/80 bg-emerald-50 px-2 py-0.5 rounded-full">
              Of {hospitals.length} Total
            </span>
          </div>
        </div>

        {/* Card 3: Ambulances On Duty */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Ambulances On Duty
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <AmbulanceIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-sky-600 tracking-tight">
              {onDutyAmbulances.length}
            </span>
            <span className="text-xs font-semibold text-sky-600/80 bg-sky-50 px-2 py-0.5 rounded-full">
              GPS Linked
            </span>
          </div>
        </div>

        {/* Card 4: Medicines Unavailable */}
        <div
          onClick={() => setActiveTab('pharmacy')}
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Medicines Unavailable
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Pill className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-purple-600 tracking-tight">
              {unavailableMedicines.length}
            </span>
            <span className="text-xs font-semibold text-purple-600/80 bg-purple-50 px-2 py-0.5 rounded-full">
              Stockout Alerts
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Map + Right Emergency Requests Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Live Ambulance Locations Map (Mockup Panel 2) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Live Ambulance Locations</h2>
              <p className="text-xs text-slate-500">Real-time GPS tracking & triage proximity</p>
            </div>
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
              Live Feeds
            </span>
          </div>

          <MapView height="380px" />
        </div>

        {/* Right: Recent Emergency Requests Table (Mockup Panel 2) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Emergency Requests</h2>
              <p className="text-xs text-slate-500">Active patient intake & bed routing queue</p>
            </div>
            <button
              onClick={() => setActiveTab('recommendations')}
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1"
            >
              <span>Smart Match Algorithm</span>
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 px-3">Patient</th>
                  <th className="pb-3 px-3">Location</th>
                  <th className="pb-3 px-3">Priority</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emergencies.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                  >
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
                        {req.id}
                      </div>
                      <div className="text-[11px] text-slate-500">{req.patientName}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1 text-slate-700 font-medium truncate max-w-[140px]">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{req.location.address.split('(')[0]}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {req.requestedAt}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md font-bold text-[11px] border ${getPriorityBadge(
                          req.priority
                        )}`}
                      >
                        {req.priority}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${getStatusBadge(
                          req.status
                        )}`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {req.status === 'Finding hospital' || req.status === 'Pending' ? (
                        <button
                          onClick={() => handlePatientSelect(req.id)}
                          className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white font-semibold transition-all shadow-2xs text-[11px]"
                        >
                          Find Hospital
                        </button>
                      ) : (
                        <button
                          onClick={() => handleHandoffSelect(req.id)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold transition-all text-[11px] flex items-center gap-1 ml-auto"
                        >
                          <span>Track</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
