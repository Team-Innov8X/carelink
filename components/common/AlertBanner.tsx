import React from 'react';
import { AlertTriangle, RefreshCw, PhoneCall, X, Clock } from 'lucide-react';
import { Hospital } from '../../types';

interface StaleDataWarningProps {
  hospital: Hospital;
  onRefresh: (hospitalId: string) => void;
  onConfirm: (hospitalId: string) => void;
  onDismiss?: () => void;
}

export const StaleDataWarning: React.FC<StaleDataWarningProps> = ({
  hospital,
  onRefresh,
  onConfirm,
  onDismiss,
}) => {
  if (hospital.lastUpdatedMinutesAgo < 10) return null;

  return (
    <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 sm:p-5 text-amber-900 shadow-sm relative animate-in fade-in slide-in-from-top-1 duration-200">
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-amber-700/60 hover:text-amber-900 p-1 rounded-lg"
          title="Dismiss warning"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Warning Info */}
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-amber-950">Data may be outdated</h4>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200 text-amber-900 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Updated {hospital.lastUpdatedMinutesAgo} min ago
              </span>
            </div>
            <p className="text-xs text-amber-800 mt-1 max-w-xl">
              Availability for <span className="font-bold">{hospital.name}</span> might have changed
              due to high emergency room traffic. Please confirm with the hospital staff.
            </p>

            {/* Current Bed count summary */}
            <div className="flex items-center gap-3 mt-3 text-xs flex-wrap">
              <span className="font-semibold text-amber-900">Current cached beds:</span>
              <span className="px-2 py-0.5 rounded bg-white/80 border border-amber-200 font-mono text-[11px]">
                Gen: {hospital.beds.general.available}/{hospital.beds.general.total}
              </span>
              <span className="px-2 py-0.5 rounded bg-white/80 border border-amber-200 font-mono text-[11px]">
                ICU: {hospital.beds.icu.available}/{hospital.beds.icu.total}
              </span>
              <span className="px-2 py-0.5 rounded bg-white/80 border border-amber-200 font-mono text-[11px] font-bold text-rose-700">
                Trauma: {hospital.beds.trauma.available}/{hospital.beds.trauma.total}
              </span>
              <span className="px-2 py-0.5 rounded bg-white/80 border border-amber-200 font-mono text-[11px]">
                Vent: {hospital.beds.ventilators.available}/{hospital.beds.ventilators.total}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons matching Screen 8 */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          <button
            onClick={() => onRefresh(hospital.id)}
            className="px-3 py-2 rounded-xl bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/60 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>View Latest</span>
          </button>
          <button
            onClick={() => onConfirm(hospital.id)}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Request Confirmation</span>
          </button>
        </div>
      </div>
    </div>
  );
};
