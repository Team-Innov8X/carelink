import React from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { Settings, Shield, Bell, Database, Radio, Sparkles } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { isSimulationActive, toggleSimulation, resetAllData } = useCareLink();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Configuration</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          CareLink emergency response, telemetry sync & regional ER protocols
        </p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Live GPS Simulation Engine</h3>
            <p className="text-xs text-slate-500">
              Continuously moves ambulances and updates en-route telemetry
            </p>
          </div>
          <button
            onClick={toggleSimulation}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              isSimulationActive
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {isSimulationActive ? 'SIMULATION ACTIVE' : 'SIMULATION PAUSED'}
          </button>
        </div>

        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Double Booking Protection</h3>
            <p className="text-xs text-slate-500">
              Strict concurrency locking on ER trauma & ICU bays
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            ENABLED (Level 3)
          </span>
        </div>

        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Stale Data Warning Threshold</h3>
            <p className="text-xs text-slate-500">
              Triggers visual alerts when hospital data is older than 10 minutes
            </p>
          </div>
          <span className="font-mono font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-lg text-slate-800">
            10 Minutes
          </span>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <h3 className="font-bold text-sm text-rose-700">Reset LocalStorage Data</h3>
            <p className="text-xs text-slate-500">
              Clear custom changes and restore default mock dataset
            </p>
          </div>
          <button
            onClick={() => {
              if (confirm('Reset all demo state to original defaults?')) {
                resetAllData();
              }
            }}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-colors"
          >
            Reset Database
          </button>
        </div>
      </div>
    </div>
  );
};
