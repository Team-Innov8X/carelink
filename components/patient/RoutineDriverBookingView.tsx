'use client';

import React, { useRef, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import {
  Car,
  MapPin,
  Clock,
  User,
  Phone,
  FileText,
  Accessibility,
  CheckCircle2,
  AlertCircle,
  LocateFixed,
  Calendar,
  Building,
  ArrowRight,
  ShieldAlert,
} from '../icons';

export const RoutineDriverBookingView: React.FC = () => {
  const { setActiveTab } = useCareLink();

  // Form states
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [destination, setDestination] = useState('');
  const [timingType, setTimingType] = useState<'asap' | 'scheduled'>('asap');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [reason, setReason] = useState('Routine Checkup');
  const [mobilityNeeds, setMobilityNeeds] = useState<string[]>(['ambulatory']);
  const [notes, setNotes] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);

  // Submission states
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; refId?: string } | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const toggleMobility = (item: string) => {
    setMobilityNeeds((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const handleGetCurrentLocation = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      setFeedback({ type: 'error', message: 'Location is unavailable. Enter a pickup address and try GPS again from a supported device.' });
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoordinates({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setPickupAddress(`Current GPS Location (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
        setIsLocating(false);
      },
      (err) => {
        setFeedback({ type: 'error', message: err.code === err.PERMISSION_DENIED ? 'Location access was denied. Enter a pickup address or allow location access.' : 'Could not get your location. Try again or enter a pickup address.' });
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientPhone.trim()) {
      setFeedback({ type: 'error', message: 'Please provide a contact phone number so the driver can reach you.' });
      return;
    }
    if (!pickupAddress.trim()) {
      setFeedback({ type: 'error', message: 'Please provide a pickup address or use GPS location.' });
      return;
    }
    if (!coordinates) {
      setFeedback({ type: 'error', message: 'Get your current location before booking so the driver receives accurate pickup coordinates.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    const targetCoords = coordinates;
    const preferredTimeDisplay = timingType === 'asap'
      ? 'Immediate (Next Available Driver)'
      : scheduledDateTime || 'Scheduled';

    const formattedNotes = [
      pickupAddress ? `Pickup: ${pickupAddress}` : '',
      destination ? `Destination: ${destination}` : '',
      altPhone ? `Alt Phone: ${altPhone}` : '',
      mobilityNeeds.length ? `Assistance: ${mobilityNeeds.join(', ')}` : '',
      notes ? `Instructions: ${notes}` : '',
    ].filter(Boolean).join(' | ');

    try {
      idempotencyKey.current ??= window.crypto.randomUUID();
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey.current },
        body: JSON.stringify({
          location: targetCoords,
          destination: destination || 'Destination to be confirmed',
          urgency: reason,
          patientPhone: patientPhone.trim(),
          preferredTime: preferredTimeDisplay,
          requiredEquipment: mobilityNeeds,
          notes: formattedNotes,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to submit driver request.');
      idempotencyKey.current = null;

      setFeedback({
        type: 'success',
        message: result.message || 'Driver request successfully registered with the medical transport fleet!',
        refId: result.request?.id,
      });

      window.dispatchEvent(new Event('carelink-sos-updated'));
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not book transport.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner Notice */}
      <div className="bg-sky-50 border border-sky-200 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/20">
            <Car className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Book Medical Transport / Routine Driver</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                Non-Emergency
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Scheduled rides for clinical checkups, dialysis appointments, chemotherapy, or discharge transfers without triggering an emergency SOS.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-800 hover:underline"
        >
          <span>View My Requests</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Success Confirmed Screen */}
      {feedback?.type === 'success' && (
        <div className="bg-white border border-emerald-200 rounded-3xl p-6 sm:p-8 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-4">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Medical Transport Booked!</h2>
          <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
            {feedback.message}
          </p>
          {feedback.refId && (
            <p className="mt-3 text-xs font-mono font-bold text-slate-700 bg-slate-100 inline-block px-3 py-1.5 rounded-lg border border-slate-200">
              Reference: #{feedback.refId}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/20 transition"
            >
              Track in Emergency & Transport Requests
            </button>
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setNotes('');
                setDestination('');
              }}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
            >
              Book Another Ride
            </button>
          </div>
        </div>
      )}

      {/* Booking Form */}
      {feedback?.type !== 'success' && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          {feedback?.type === 'error' && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Section 1: Passenger / Patient Contact */}
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <User className="h-4 w-4 text-sky-600" />
              1. Passenger & Contact Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Passenger Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Primary Contact Phone <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  required
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alternate / Caregiver Phone
                </label>
                <input
                  type="tel"
                  placeholder="Optional backup phone"
                  value={altPhone}
                  onChange={(e) => setAltPhone(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Trip Schedule */}
          <div className="pt-4 border-t border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-600" />
              2. Trip Schedule
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  When do you need the ride?
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTimingType('asap')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      timingType === 'asap'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    As Soon As Possible (ASAP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimingType('scheduled')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      timingType === 'scheduled'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Schedule for Later
                  </button>
                </div>
              </div>

              {timingType === 'scheduled' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Date & Time <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Pickup & Drop-Off Locations */}
          <div className="pt-4 border-t border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-sky-600" />
              3. Pickup & Destination Locations
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Pickup Location / Address <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGetCurrentLocation}
                    disabled={isLocating}
                    className="text-[11px] font-bold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
                  >
                    <LocateFixed className={`h-3 w-3 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>{isLocating ? 'Locating…' : 'Use GPS'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Street, Landmark, Apartment / Flat number"
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Destination (Hospital, Clinic, or Address)
                </label>
                <input
                  type="text"
                  placeholder="e.g. AIIMS Main Building, City Hospital, or Home"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Trip Purpose & Mobility Assistance */}
          <div className="pt-4 border-t border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Accessibility className="h-4 w-4 text-sky-600" />
              4. Trip Purpose & Mobility Needs
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Medical Transit
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                >
                  <option value="Routine Checkup">Routine Doctor Checkup / OPD</option>
                  <option value="Dialysis Treatment">Scheduled Dialysis Treatment</option>
                  <option value="Physical Therapy">Physical Rehabilitation / Therapy</option>
                  <option value="Chemotherapy / Oncology">Chemotherapy / Infusion Session</option>
                  <option value="Hospital Discharge Transfer">Hospital Discharge Transfer</option>
                  <option value="Diagnostic / Lab Imaging">Diagnostic Imaging / Lab Testing</option>
                  <option value="Other Non-Emergency">Other Non-Emergency Medical Need</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Special Mobility & Equipment Requirements
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'ambulatory', label: 'Ambulatory (Can walk)' },
                    { id: 'wheelchair', label: 'Wheelchair Accessible' },
                    { id: 'stretcher', label: 'Stretcher Required' },
                    { id: 'oxygen', label: 'Portable Oxygen Support' },
                    { id: 'companion', label: 'Companion Traveling Along' },
                    { id: 'assistance_stairs', label: 'Assistance on Stairs' },
                  ].map((item) => {
                    const selected = mobilityNeeds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleMobility(item.id)}
                        className={`text-left p-2.5 rounded-xl border text-xs font-medium transition ${
                          selected
                            ? 'bg-sky-50 border-sky-400 text-sky-900 font-semibold'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`h-3 w-3 rounded-full border ${
                              selected ? 'bg-sky-600 border-sky-600' : 'border-slate-400'
                            }`}
                          />
                          <span>{item.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Driver Instructions & Notes */}
          <div className="pt-4 border-t border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-sky-600" />
              5. Instructions for the Driver
            </h2>
            <textarea
              rows={2}
              placeholder="e.g. Please call on arrival; patient is waiting at Gate 2; elevator is currently under maintenance."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[11px] text-slate-400">
              Need immediate 911 emergency aid? Use the red Emergency SOS button instead.
            </p>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/25 transition disabled:opacity-60"
            >
              <Car className="h-4 w-4" />
              <span>{isSubmitting ? 'Transmitting Booking…' : 'Submit Routine Transport Request'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
