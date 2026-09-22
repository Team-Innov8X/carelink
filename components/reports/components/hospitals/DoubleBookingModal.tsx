import React from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { AlertOctagon, ArrowRight, X, RefreshCw, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const DoubleBookingModal: React.FC = () => {
  const {
    doubleBookingConflict,
    dismissDoubleBookingModal,
    retryWithAlternativeBed,
    requestHospitalBed,
  } = useCareLink();

  if (!doubleBookingConflict || !doubleBookingConflict.isOpen) return null;

  const {
    requestId,
    bedType,
    competingRequestId,
    competingTime,
    hospitalName,
    suggestedAlternatives,
  } = doubleBookingConflict;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-rose-200 animate-in zoom-in-95 duration-150">
        {/* Top Alert Header */}
        <div className="bg-rose-50 px-6 py-5 border-b border-rose-100 flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-inner">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-rose-950">Double Booking Detected</h3>
              <button
                onClick={dismissDoubleBookingModal}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-rose-800 mt-1 leading-relaxed">
              This <span className="font-semibold text-rose-950">{bedType}</span> at{' '}
              <span className="font-semibold text-rose-950">{hospitalName}</span> was just reserved
              by another active dispatch (<span className="font-mono font-bold">{competingRequestId}</span>)
              at {competingTime}.
            </p>
          </div>
        </div>

        {/* Alternatives Section (Mockup Panel 9) */}
        <div className="p-6 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Suggested Immediate Alternatives
          </div>

          <div className="space-y-2.5">
            {suggestedAlternatives.map((alt) => (
              <div
                key={alt.hospitalId}
                className="p-3.5 rounded-2xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 transition-all flex items-center justify-between gap-3 group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 group-hover:text-sky-700 transition-colors">
                      {alt.hospitalName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {alt.availableCount} Available
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span className="font-semibold text-slate-700">{alt.bedType}</span>
                    <span>•</span>
                    <span>{alt.distanceKm} km</span>
                    <span>•</span>
                    <span className="text-sky-600 font-semibold">ETA: {alt.etaMin} min</span>
                  </div>
                </div>

                <button
                  onClick={() => retryWithAlternativeBed(alt.hospitalId)}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-xs shrink-0"
                >
                  <span>Select</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-sky-500 shrink-0" />
            <span>
              CareLink Concurrency Lock prevents patient ambulances from arriving at occupied ER beds.
            </span>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            onClick={dismissDoubleBookingModal}
            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200/80 font-semibold text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              // Retry reserving at the first alternative
              if (suggestedAlternatives.length > 0) {
                retryWithAlternativeBed(suggestedAlternatives[0].hospitalId);
              } else {
                dismissDoubleBookingModal();
              }
            }}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Auto-Retry Best Alternative</span>
          </button>
        </div>
      </div>
    </div>
  );
};
