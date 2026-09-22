import React, { useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { PriorityLevel } from '../../types';
import {
  Siren,
  Search,
  Filter,
  PlusCircle,
  MapPin,
  Clock,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  User,
  HeartPulse,
} from 'lucide-react';

interface EmergencyRequestsViewProps {
  onOpenNewEmergency: () => void;
}

export const EmergencyRequestsView: React.FC<EmergencyRequestsViewProps> = ({
  onOpenNewEmergency,
}) => {
  const { emergencies, setSelectedEmergencyId, setActiveTab } = useCareLink();

  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = emergencies.filter((e) => {
    if (priorityFilter !== 'all' && e.priority.toLowerCase() !== priorityFilter) return false;
    if (statusFilter !== 'all' && e.status.toLowerCase() !== statusFilter) return false;
    if (
      searchQuery &&
      !e.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !e.patientName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !e.condition.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleMatch = (id: string) => {
    setSelectedEmergencyId(id);
    setActiveTab('recommendations');
  };

  const handleTrack = (id: string) => {
    setSelectedEmergencyId(id);
    setActiveTab('handoff');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Emergency Intake & Triage Requests
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time ambulance dispatch queue, patient telemetry, and hospital routing
          </p>
        </div>

        <button
          onClick={onOpenNewEmergency}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-600/20 flex items-center gap-2 self-start sm:self-auto transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ New SOS Call</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient ID, name, or symptoms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
          />
        </div>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium"
        >
          <option value="all">Priority: All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium"
        >
          <option value="all">Status: All</option>
          <option value="finding hospital">Finding Hospital</option>
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
          <option value="en route">En Route</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filtered.map((req) => (
          <div
            key={req.id}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-extrabold text-sm ${
                  req.priority === 'Critical' || req.priority === 'High'
                    ? 'bg-rose-100 text-rose-700'
                    : req.priority === 'Medium'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {req.priority === 'Critical' || req.priority === 'High' ? '🚨' : '⚠️'}
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-extrabold text-slate-900 text-base">{req.id}</span>
                  <span className="font-bold text-slate-700 text-sm">
                    {req.patientName} ({req.age}y, {req.gender})
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      req.priority === 'High' || req.priority === 'Critical'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {req.priority}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                    {req.status}
                  </span>
                </div>

                <div className="text-xs text-slate-700 font-semibold mt-1">
                  Condition: <span className="text-slate-900">{req.condition}</span>
                </div>

                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {req.location.address}
                  </span>
                  <span>•</span>
                  <span>Required: {req.requiredFacilities.join(', ')}</span>
                  <span>•</span>
                  <span className="font-mono text-[11px] text-slate-400">{req.requestedAt}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                onClick={() => handleMatch(req.id)}
                className="px-3.5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Smart Match Bed</span>
              </button>

              <button
                onClick={() => handleTrack(req.id)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1"
              >
                <span>Track</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
