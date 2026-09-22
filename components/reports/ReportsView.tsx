import React from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  ShieldCheck,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { emergencies, hospitals, medicines } = useCareLink();

  const totalCases = emergencies.length;
  const completedCases = emergencies.filter((e) => e.status === 'Completed').length;
  const avgEta = 7.4; // minutes
  const totalBedsAvailable = hospitals.reduce((acc, h) => acc + h.beds.general.available + h.beds.icu.available + h.beds.trauma.available, 0);
  const totalBedsCapacity = hospitals.reduce((acc, h) => acc + h.beds.general.total + h.beds.icu.total + h.beds.trauma.total, 0);
  const bedOccupancyRate = Math.round(((totalBedsCapacity - totalBedsAvailable) / totalBedsCapacity) * 100);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Emergency Health Analytics & Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Regional ER response times, bed occupancy velocity, and pharmacy supply chains
          </p>
        </div>

        <button
          onClick={() => alert('Exporting CareLink regional audit report (PDF/CSV)...')}
          className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl shadow-2xs flex items-center gap-2 self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>Export Analytics</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Golden Hour Response
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600">{avgEta}m</span>
            <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
              -2.1m faster
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Average triage-to-bed time</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
            ER Bed Occupancy
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{bedOccupancyRate}%</span>
            <span className="text-xs text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
              High Load
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {totalBedsAvailable} beds currently free
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Double Booking Defended
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-sky-600">14</span>
            <span className="text-xs text-sky-700 font-bold bg-sky-50 px-1.5 py-0.5 rounded">
              100% Lock
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Collisions automatically prevented</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Critical Drug Fill Rate
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-purple-600">96.8%</span>
            <span className="text-xs text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded">
              4 Shortages
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Across registered pharmacies</span>
        </div>
      </div>

      {/* Hospital Occupancy Comparison Table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h3 className="font-bold text-base text-slate-900 mb-4">
          Hospital Capacity & Specialty Bed Utilization
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th className="pb-3 px-3">Hospital</th>
                <th className="pb-3 px-3">Status</th>
                <th className="pb-3 px-3">General Bed Load</th>
                <th className="pb-3 px-3">ICU Load</th>
                <th className="pb-3 px-3">Trauma Load</th>
                <th className="pb-3 px-3">Telemetric Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hospitals.map((hosp) => {
                const icuLoad = Math.round(
                  ((hosp.beds.icu.total - hosp.beds.icu.available) / hosp.beds.icu.total) * 100
                );
                const traumaLoad = Math.round(
                  ((hosp.beds.trauma.total - hosp.beds.trauma.available) / hosp.beds.trauma.total) * 100
                );

                return (
                  <tr key={hosp.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-bold text-slate-900">{hosp.name}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-slate-100 text-slate-700">
                        {hosp.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="w-32 bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-sky-500 h-full rounded-full"
                          style={{
                            width: `${
                              ((hosp.beds.general.total - hosp.beds.general.available) /
                                hosp.beds.general.total) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-mono font-bold ${
                          icuLoad > 80 ? 'text-rose-600' : 'text-slate-700'
                        }`}
                      >
                        {icuLoad}%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-mono font-bold ${
                          traumaLoad > 80 ? 'text-rose-600' : 'text-slate-700'
                        }`}
                      >
                        {traumaLoad}%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[11px] text-slate-400 font-mono">
                        {hosp.lastUpdatedMinutesAgo === 0
                          ? 'Real-time'
                          : `${hosp.lastUpdatedMinutesAgo}m ago`}
                      </span>
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
