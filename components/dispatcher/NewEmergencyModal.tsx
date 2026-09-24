import React, { useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { PriorityLevel } from '../../types';
import {
  X,
  Siren,
  MapPin,
  HeartPulse,
  Activity,
  User,
  Clock,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

interface NewEmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewEmergencyModal: React.FC<NewEmergencyModalProps> = ({ isOpen, onClose }) => {
  const { createNewEmergency, setActiveTab } = useCareLink();

  const [patientName, setPatientName] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState('');
  const [condition, setCondition] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('Medium');
  const [locationAddress, setLocationAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [oxygenSaturation, setOxygenSaturation] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [facilities, setFacilities] = useState<string[]>([]);
  const [etaLimit, setEtaLimit] = useState(15);

  if (!isOpen) return null;

  const toggleFacility = (facility: string) => {
    setFacilities((prev) =>
      prev.includes(facility) ? prev.filter((f) => f !== facility) : [...prev, facility]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createNewEmergency({
      patientName,
      age: Number(age),
      gender,
      condition,
      priority,
      location: {
        lat: Number(latitude),
        lng: Number(longitude),
        address: locationAddress,
      },
      requiredFacilities: facilities,
      etaLimitMin: Number(etaLimit),
      vitals: {
        bp: bloodPressure,
        heartRate: Number(heartRate),
        spO2: Number(oxygenSaturation),
        conditionNotes,
      },
    });

    onClose();
    setActiveTab('recommendations');
  };

  const facilityOptions = [
    'Trauma Care',
    'ICU',
    'Ventilator',
    'Cardiac',
    'Neuro',
    'Orthopedic',
    'Pediatric',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Siren className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base">New Emergency Intake (112 / SOS)</h3>
              <p className="text-[11px] text-rose-100">Dispatches field ambulance and matches hospital beds</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Patient Details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                Patient Name
              </label>
              <input
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-800 outline-none focus:border-rose-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                  Age
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={age}
                  onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-800 outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                  Gender
                </label>
                <select
                  required
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl border border-slate-200 font-semibold text-slate-800 outline-none focus:border-rose-500"
                >
                  <option value="" disabled>Select</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Condition & Priority */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                Medical Condition
              </label>
              <input
                type="text"
                required
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-800 outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full px-2 py-2 rounded-xl border border-slate-200 font-bold text-rose-700 outline-none focus:border-rose-500"
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
              Incident / Pickup Location
            </label>
            <input
              type="text"
              required
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-800 outline-none focus:border-rose-500"
            />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <input type="number" required step="any" placeholder="Latitude" value={latitude} onChange={(e) => setLatitude(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-800 outline-none focus:border-rose-500" />
              <input type="number" required step="any" placeholder="Longitude" value={longitude} onChange={(e) => setLongitude(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-800 outline-none focus:border-rose-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <input type="text" required placeholder="Blood pressure" value={bloodPressure} onChange={(e) => setBloodPressure(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800" />
            <input type="number" required min="1" placeholder="Heart rate" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800" />
            <input type="number" required min="1" max="100" placeholder="SpO₂" value={oxygenSaturation} onChange={(e) => setOxygenSaturation(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800" />
            <textarea placeholder="Patient notes" value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} className="col-span-3 w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800" />
          </div>

          {/* Required Facilities Chips */}
          <div>
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1.5">
              Required Facilities for CareMatch Engine
            </label>
            <div className="flex flex-wrap gap-1.5">
              {facilityOptions.map((fac) => {
                const isSelected = facilities.includes(fac);
                return (
                  <button
                    type="button"
                    key={fac}
                    onClick={() => toggleFacility(fac)}
                    className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-all ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {fac}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Golden Hour ETA Limit */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                Target Golden Hour ETA Limit
              </label>
              <span className="font-mono font-bold text-rose-600">{etaLimit} Minutes</span>
            </div>
            <input
              type="range"
              min="5"
              max="45"
              step="5"
              value={etaLimit}
              onChange={(e) => setEtaLimit(Number(e.target.value))}
              className="w-full accent-rose-600 cursor-pointer"
            />
          </div>

          {/* Submit */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Dispatch & Run Smart Match</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
