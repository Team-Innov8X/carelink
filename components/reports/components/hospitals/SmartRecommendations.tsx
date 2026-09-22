import React, { useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { calculateHospitalRecommendations } from '../../utils/recommendationAlgorithm';
import {
  ArrowLeft,
  User,
  MapPin,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
} from 'lucide-react';

export const SmartRecommendations: React.FC = () => {
  const {
    emergencies,
    selectedEmergencyId,
    setSelectedEmergencyId,
    hospitals,
    requestHospitalBed,
    setActiveTab,
  } = useCareLink();

  const [sortBy, setSortBy] = useState<'match' | 'distance' | 'eta'>('match');

  const currentEmergency =
    emergencies.find((e) => e.id === selectedEmergencyId) || emergencies[0];

  const recommendations = calculateHospitalRecommendations(currentEmergency, hospitals);

  // Sorting
  const sortedRecs = [...recommendations].sort((a, b) => {
    if (sortBy === 'distance') return a.distanceKm - b.distanceKm;
    if (sortBy === 'eta') return a.etaMin - b.etaMin;
    return b.matchScore - a.matchScore;
  });

  const handleRequestHospital = (hospitalId: string) => {
    const success = requestHospitalBed(currentEmergency.id, hospitalId);
    if (success) {
      setActiveTab('handoff');
    }
  };

  const getMatchBadgeStyle = (score: number) => {
    if (score >= 85) return 'bg-emerald-50 text-emerald-700 border-emerald-300';
    if (score >= 70) return 'bg-sky-50 text-sky-700 border-sky-300';
    return 'bg-amber-50 text-amber-700 border-amber-300';
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back button header (Mockup Panel 4) */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>

        {/* Patient Case Switcher if multiple */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Switch Case:</span>
          <select
            value={currentEmergency.id}
            onChange={(e) => setSelectedEmergencyId(e.target.value)}
            className="text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 outline-none"
          >
            {emergencies.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} - {e.patientName} ({e.condition.slice(0, 20)}...)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Recommended Hospitals for Patient
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Algorithmic matching based on real-time trauma bed availability, distance & ICU telemetry.
        </p>
      </div>

      {/* Patient Summary Card (Mockup Panel 4) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-6 flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shrink-0 shadow-xs">
            <User className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Patient ID
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                {currentEmergency.priority} Priority
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-0.5">{currentEmergency.id}</h2>
            <div className="text-xs text-slate-700 font-medium mt-1">
              Condition: <span className="font-bold">{currentEmergency.condition}</span>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>Location: {currentEmergency.location.address}</span>
            </div>
          </div>
        </div>

        {/* Required Facilities & Constraints */}
        <div className="md:col-span-6 bg-slate-50 rounded-xl p-4 border border-slate-200/80 flex flex-col justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Required Facilities
            </span>
            <div className="flex flex-wrap gap-2">
              {currentEmergency.requiredFacilities.map((fac) => (
                <span
                  key={fac}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-semibold shadow-2xs flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  {fac}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>
                Target Golden Hour ETA Limit: <b>{currentEmergency.etaLimitMin} min</b>
              </span>
            </div>
            <span className="text-[11px] font-mono text-sky-600 font-bold bg-sky-50 px-2 py-0.5 rounded">
              Algorithm: CareMatch v2.4
            </span>
          </div>
        </div>
      </div>

      {/* Top 3 Recommendations Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>Top Recommendations</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
            {sortedRecs.length} Analyzed
          </span>
        </h3>

        {/* Sort by dropdown */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 outline-none"
          >
            <option value="match">Best Match Score</option>
            <option value="eta">Fastest ETA</option>
            <option value="distance">Closest Distance</option>
          </select>
        </div>
      </div>

      {/* Ranked Hospital List Cards (Mockup Screen 4) */}
      <div className="space-y-4">
        {sortedRecs.slice(0, 3).map((rec, index) => {
          const rank = index + 1;
          const { hospital, matchScore } = rec;

          return (
            <div
              key={hospital.id}
              className={`bg-white rounded-2xl p-5 border transition-all hover:shadow-md ${
                rank === 1
                  ? 'border-emerald-300 ring-2 ring-emerald-100 shadow-sm'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Left Rank & Info */}
                <div className="flex items-start gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base shrink-0 shadow-xs ${
                      rank === 1
                        ? 'bg-emerald-600 text-white'
                        : rank === 2
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-700 text-white'
                    }`}
                  >
                    {rank}
                  </div>

                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-base font-bold text-slate-900">{hospital.name}</h4>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${getMatchBadgeStyle(
                          matchScore
                        )}`}
                      >
                        {matchScore}% Match
                      </span>
                    </div>

                    {/* Amenities tags matching mockup */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {hospital.specialties.map((spec) => (
                        <span
                          key={spec}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>

                    {/* Bed stats highlights */}
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-2.5">
                      <span>
                        Gen Beds: <b>{hospital.beds.general.available}</b>
                      </span>
                      <span>•</span>
                      <span className="text-amber-700">
                        ICU: <b>{hospital.beds.icu.available}</b>
                      </span>
                      <span>•</span>
                      <span className="text-rose-700">
                        Trauma: <b>{hospital.beds.trauma.available}</b>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Distance, ETA, and Request Button */}
                <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left sm:text-right">
                    <div className="text-sm font-bold text-slate-800">{hospital.distanceKm} km</div>
                    <div className="text-xs font-semibold text-emerald-600">
                      ETA: ~{hospital.etaMin} min
                    </div>
                  </div>

                  <button
                    onClick={() => handleRequestHospital(hospital.id)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                  >
                    Request Bed
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* View all hospitals footer link */}
      <div className="text-center pt-2">
        <button
          onClick={() => setActiveTab('hospitals')}
          className="text-xs font-bold text-sky-600 hover:text-sky-700 transition-colors inline-flex items-center gap-1"
        >
          <span>View all hospitals & full registry</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
