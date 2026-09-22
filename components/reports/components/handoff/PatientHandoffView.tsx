import React from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { MapView } from '../common/MapView';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  MapPin,
  Ambulance,
  Building2,
  HeartPulse,
  Activity,
  User,
  ShieldCheck,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import { HandoffChecklist } from '../../types';

export const PatientHandoffView: React.FC = () => {
  const {
    emergencies,
    selectedEmergencyId,
    hospitals,
    updateHandoffChecklist,
    completeHandoff,
    setActiveTab,
  } = useCareLink();

  const currentEmergency =
    emergencies.find((e) => e.id === selectedEmergencyId) || emergencies[0];

  const assignedHospital = hospitals.find(
    (h) => h.id === currentEmergency.assignedHospitalId
  ) || hospitals[0];

  const handleToggleChecklist = (key: keyof HandoffChecklist) => {
    updateHandoffChecklist(
      currentEmergency.id,
      key,
      !currentEmergency.checklist[key]
    );
  };

  const handleComplete = () => {
    completeHandoff(currentEmergency.id);
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  // Steps matching Mockup Screen 6
  const steps = [
    { title: 'Request', completed: true },
    {
      title: 'Hospital Assigned',
      completed:
        currentEmergency.status === 'Assigned' ||
        currentEmergency.status === 'En Route' ||
        currentEmergency.status === 'Completed',
    },
    {
      title: 'En Route',
      completed:
        currentEmergency.status === 'En Route' || currentEmergency.status === 'Completed',
      active: currentEmergency.status === 'En Route',
    },
    {
      title: 'Handoff',
      completed: currentEmergency.status === 'Completed',
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header (Mockup Panel 6) */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>

        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          {currentEmergency.status.toUpperCase()}
        </span>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Case {currentEmergency.id}
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
            {currentEmergency.priority} Priority
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Patient Handoff & Emergency Coordination Telemetry
        </p>
      </div>

      {/* Progress Stepper (Mockup Panel 6) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between relative max-w-2xl mx-auto">
          {/* Progress Bar background line */}
          <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-1 bg-slate-200 -z-0"></div>

          {steps.map((step, idx) => {
            return (
              <div key={step.title} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    step.completed
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                      : step.active
                      ? 'bg-sky-600 text-white ring-4 ring-sky-200 animate-pulse'
                      : 'bg-white text-slate-400 border-2 border-slate-300'
                  }`}
                >
                  {step.completed ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                </div>
                <span
                  className={`text-xs mt-2 font-semibold ${
                    step.completed || step.active ? 'text-slate-900 font-bold' : 'text-slate-400'
                  }`}
                >
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Left Patient Details + Right Live Tracking Map */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Side: Patient Details */}
        <div className="md:col-span-6 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-base text-slate-900">Patient Details</h3>
            <span className="text-xs text-slate-400 font-mono">Case #{currentEmergency.id}</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Patient Name</span>
                <span className="font-bold text-slate-800 text-sm">
                  {currentEmergency.patientName} ({currentEmergency.age}y, {currentEmergency.gender})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <HeartPulse className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Condition & Trauma</span>
                <span className="font-bold text-slate-800">{currentEmergency.condition}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Pickup Location</span>
                <span className="font-semibold text-slate-800">
                  {currentEmergency.location.address}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Assigned Destination</span>
                <span className="font-bold text-emerald-700">{assignedHospital.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Ambulance className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Ambulance Vehicle</span>
                <span className="font-bold text-slate-800">
                  {currentEmergency.assignedAmbulanceId || 'A-12'} (On Route)
                </span>
              </div>
            </div>
          </div>

          {/* Vitals Telemetry Card */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Field Paramedic Telemetry
            </span>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Blood Pressure</span>
                <span className="font-bold font-mono text-slate-800">
                  {currentEmergency.vitals.bp}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Heart Rate</span>
                <span className="font-bold font-mono text-rose-600">
                  {currentEmergency.vitals.heartRate} bpm
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Oxygen Sat</span>
                <span className="font-bold font-mono text-emerald-600">
                  {currentEmergency.vitals.spO2}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Live Tracking Map & ETA */}
        <div className="md:col-span-6 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base text-slate-900">Live Tracking</h3>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <Clock className="w-3.5 h-3.5" />
                <span>ETA to Hospital: {currentEmergency.currentEtaMin || 6} min</span>
              </div>
            </div>

            <MapView height="240px" showRouteLine={true} focusHospitalId={assignedHospital.id} />
          </div>

          {/* Handoff Checklist (Mockup Panel 6) */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Digital Handoff Checklist
            </h4>

            <div className="space-y-2">
              <label
                onClick={() => handleToggleChecklist('arrivedAtHospital')}
                className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none hover:text-slate-900"
              >
                {currentEmergency.checklist.arrivedAtHospital ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                )}
                <span className={currentEmergency.checklist.arrivedAtHospital ? 'font-semibold' : ''}>
                  Patient arrived at hospital
                </span>
              </label>

              <label
                onClick={() => handleToggleChecklist('detailsShared')}
                className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none hover:text-slate-900"
              >
                {currentEmergency.checklist.detailsShared ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                )}
                <span className={currentEmergency.checklist.detailsShared ? 'font-semibold' : ''}>
                  Patient details shared
                </span>
              </label>

              <label
                onClick={() => handleToggleChecklist('vitalsHandedOver')}
                className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none hover:text-slate-900"
              >
                {currentEmergency.checklist.vitalsHandedOver ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                )}
                <span className={currentEmergency.checklist.vitalsHandedOver ? 'font-semibold' : ''}>
                  Vitals & reports handed over
                </span>
              </label>

              <label
                onClick={() => handleToggleChecklist('bedConfirmed')}
                className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none hover:text-slate-900"
              >
                {currentEmergency.checklist.bedConfirmed ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                )}
                <span className={currentEmergency.checklist.bedConfirmed ? 'font-semibold' : ''}>
                  Bed confirmed
                </span>
              </label>
            </div>

            {/* Mark as Completed CTA */}
            <button
              onClick={handleComplete}
              disabled={currentEmergency.status === 'Completed'}
              className={`w-full mt-4 py-3 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 ${
                currentEmergency.status === 'Completed'
                  ? 'bg-slate-200 text-slate-500 cursor-default'
                  : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/20 active:scale-98'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {currentEmergency.status === 'Completed'
                  ? 'Handoff Successfully Completed'
                  : 'Mark as Completed'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
