import React, { useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { StaleDataWarning } from '../common/AlertBanner';
import {
  Building2,
  Search,
  Filter,
  RotateCcw,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  ArrowRight,
  Sparkles,
  Phone,
} from 'lucide-react';

export const HospitalDirectory: React.FC = () => {
  const {
    hospitals,
    selectedEmergencyId,
    requestHospitalBed,
    refreshHospitalData,
    setActiveTab,
    setSelectedHospitalId,
  } = useCareLink();

  const [searchQuery, setSearchQuery] = useState('');
  const [distanceFilter, setDistanceFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [dismissedStaleIds, setDismissedStaleIds] = useState<string[]>([]);

  // Filter logic
  const filteredHospitals = hospitals.filter((hosp) => {
    // Search query
    if (
      searchQuery &&
      !hosp.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !hosp.specialties.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
    ) {
      return false;
    }

    // Distance filter
    if (distanceFilter === 'under10' && hosp.distanceKm > 10) return false;
    if (distanceFilter === 'under15' && hosp.distanceKm > 15) return false;
    if (distanceFilter === 'under20' && hosp.distanceKm > 20) return false;

    // Availability filter
    if (availabilityFilter !== 'all' && hosp.status.toLowerCase() !== availabilityFilter) {
      return false;
    }

    // Specialty filter
    if (
      specialtyFilter !== 'all' &&
      !hosp.specialties.some((s) => s.toLowerCase().includes(specialtyFilter.toLowerCase()))
    ) {
      return false;
    }

    return true;
  });

  const resetFilters = () => {
    setSearchQuery('');
    setDistanceFilter('all');
    setAvailabilityFilter('all');
    setSpecialtyFilter('all');
  };

  const handleRequestBed = (hospitalId: string) => {
    const reqId = selectedEmergencyId || '';
    const success = requestHospitalBed(reqId, hospitalId);
    if (success) {
      setActiveTab('handoff');
    }
  };

  const handleViewHospital = (hospitalId: string) => {
    setSelectedHospitalId(hospitalId);
    setActiveTab('hospital-portal');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nearby Hospitals</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time ER bed availability, critical care capacity & specialty units
          </p>
        </div>

        <button
          onClick={() => setActiveTab('recommendations')}
          className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md flex items-center gap-2 self-start sm:self-auto transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>Patient Smart Match (AI)</span>
        </button>
      </div>

      {/* Show warnings for any hospital with outdated data. */}
      {hospitals
        .filter((h) => h.lastUpdatedMinutesAgo >= 10 && !dismissedStaleIds.includes(h.id))
        .map((staleHosp) => (
          <StaleDataWarning
            key={`stale-${staleHosp.id}`}
            hospital={staleHosp}
            onRefresh={(id) => refreshHospitalData(id)}
            onConfirm={(id) => {
              alert(`Dispatch telephone confirmation initiated with ${staleHosp.name} triage desk.`);
              refreshHospitalData(id);
            }}
            onDismiss={() => setDismissedStaleIds((prev) => [...prev, staleHosp.id])}
          />
        ))}

      {/* Filter and Search Bar (Mockup Screen 3) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search hospital..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
          />
        </div>

        {/* Distance dropdown */}
        <select
          value={distanceFilter}
          onChange={(e) => setDistanceFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 font-medium outline-none cursor-pointer hover:border-slate-300"
        >
          <option value="all">Distance: All</option>
          <option value="under10">&lt; 10 km</option>
          <option value="under15">&lt; 15 km</option>
          <option value="under20">&lt; 20 km</option>
        </select>

        {/* Availability dropdown */}
        <select
          value={availabilityFilter}
          onChange={(e) => setAvailabilityFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 font-medium outline-none cursor-pointer hover:border-slate-300"
        >
          <option value="all">Availability: All</option>
          <option value="available">Available</option>
          <option value="limited">Limited</option>
          <option value="full">Full</option>
        </select>

        {/* Specialization dropdown */}
        <select
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 font-medium outline-none cursor-pointer hover:border-slate-300"
        >
          <option value="all">Specialization: All</option>
          <option value="trauma">Trauma Care</option>
          <option value="cardiac">Cardiac</option>
          <option value="icu">ICU</option>
          <option value="ventilator">Ventilator</option>
          <option value="orthopedic">Orthopedic</option>
          <option value="maternity">Maternity</option>
        </select>

        {/* Reset button */}
        <button
          onClick={resetFilters}
          className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Hospital Table / Cards (Mockup Screen 3) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Hospital Name</th>
                <th className="py-3.5 px-4">Distance</th>
                <th className="py-3.5 px-4">General Beds</th>
                <th className="py-3.5 px-4">ICU Beds</th>
                <th className="py-3.5 px-4">Trauma Beds</th>
                <th className="py-3.5 px-4">Specialization</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHospitals.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No hospital records are available.</td></tr>
              )}
              {filteredHospitals.map((hosp) => {
                const isAvail = hosp.status === 'Available';
                const isLimited = hosp.status === 'Limited';
                const isFull = hosp.status === 'Full';

                return (
                  <tr
                    key={hosp.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* Hospital Name & address */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 font-extrabold flex items-center justify-center shrink-0">
                          H
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-900 group-hover:text-sky-600 transition-colors">
                            {hosp.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            {hosp.location.address}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Distance & ETA */}
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-800">{hosp.distanceKm} km</div>
                      <div className="text-[11px] text-slate-400">ETA: ~{hosp.etaMin} min</div>
                    </td>

                    {/* General Beds */}
                    <td className="py-4 px-4">
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {hosp.beds.general.available}
                      </span>
                      <span className="text-slate-400 font-mono text-xs">
                        /{hosp.beds.general.total}
                      </span>
                    </td>

                    {/* ICU Beds */}
                    <td className="py-4 px-4">
                      <span
                        className={`font-mono font-bold text-sm ${
                          hosp.beds.icu.available <= 1 ? 'text-rose-600' : 'text-amber-700'
                        }`}
                      >
                        {hosp.beds.icu.available}
                      </span>
                      <span className="text-slate-400 font-mono text-xs">
                        /{hosp.beds.icu.total}
                      </span>
                    </td>

                    {/* Trauma Beds */}
                    <td className="py-4 px-4">
                      <span
                        className={`font-mono font-bold text-sm ${
                          hosp.beds.trauma.available === 0
                            ? 'text-rose-600 font-extrabold'
                            : 'text-slate-800'
                        }`}
                      >
                        {hosp.beds.trauma.available}
                      </span>
                      <span className="text-slate-400 font-mono text-xs">
                        /{hosp.beds.trauma.total}
                      </span>
                    </td>

                    {/* Specialization */}
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {hosp.specialties.slice(0, 3).map((spec) => (
                          <span
                            key={spec}
                            className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium"
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          isAvail
                            ? 'bg-emerald-100 text-emerald-800'
                            : isLimited
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isAvail ? 'bg-emerald-600' : isLimited ? 'bg-amber-600' : 'bg-rose-600'
                          }`}
                        />
                        {hosp.status}
                      </span>
                    </td>

                    {/* Action buttons */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleViewHospital(hosp.id)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleRequestBed(hosp.id)}
                          disabled={isFull}
                          className={`px-3 py-1.5 rounded-lg font-semibold text-xs shadow-2xs transition-all ${
                            isFull
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/20'
                          }`}
                        >
                          Request Bed
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
