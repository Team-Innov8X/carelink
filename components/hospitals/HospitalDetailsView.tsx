'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  Phone,
  Stethoscope,
  Navigation,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { useCareLink } from '../../context/CareLinkContext';

type DoctorInfo = {
  id: string;
  name: string;
  qualification: string;
  specialization: string;
  availability: 'available' | 'on_call' | 'off_duty';
  phone?: string;
  experienceYears?: number;
};

type HoldInfo = {
  id: string;
  hospitalId: string;
  status: 'queued' | 'pending' | 'confirmed' | 'rejected' | 'expired' | 'cancelled';
  queuePosition?: number;
};

type HospitalDetail = {
  id: string;
  name: string;
  code?: string;
  status: string;
  address?: { street?: string; city?: string; state?: string; zipCode?: string; country?: string } | string;
  contact?: { phone?: string; emergencyHotline?: string; email?: string };
  coordinates?: { latitude: number; longitude: number };
  distanceKm?: number | null;
  directionsUrl: string;
  doctors: DoctorInfo[];
  beds: {
    general: { available: number; total: number };
    icu: { available: number; total: number };
    trauma: { available: number; total: number };
    ventilators: { available: number; total: number };
  };
  specialties: string[];
};

export function HospitalDetailsView() {
  const { selectedHospitalId, setActiveTab } = useCareLink();
  const [hospital, setHospital] = useState<HospitalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [patientCoords, setPatientCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Doctors from GET /api/hospitals/[id]/doctors
  const [doctors, setDoctors] = useState<DoctorInfo[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);

  // Bed hold status
  const [myHolds, setMyHolds] = useState<HoldInfo[]>([]);
  const [requestingBed, setRequestingBed] = useState(false);
  const [bedMessage, setBedMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPatientCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setPatientCoords({ lat: 28.6139, lng: 77.209 }),
        { timeout: 8000 }
      );
    } else {
      setPatientCoords({ lat: 28.6139, lng: 77.209 });
    }
  }, []);

  const loadPatientHolds = useCallback(async () => {
    try {
      const res = await fetch('/api/holds/mine', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.holds)) {
        setMyHolds(data.holds);
      }
    } catch {
      // Ignore background hold check failures
    }
  }, []);

  useEffect(() => {
    void loadPatientHolds();
    const interval = setInterval(loadPatientHolds, 5000);
    return () => clearInterval(interval);
  }, [loadPatientHolds]);

  const loadDoctors = useCallback(async (hospitalId: string) => {
    setDoctorsLoading(true);
    try {
      const res = await fetch(`/api/hospitals/${encodeURIComponent(hospitalId)}/doctors`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load doctors');
      const data = await res.json();
      setDoctors(data.doctors ?? []);
    } catch {
      setDoctors([]);
    } finally {
      setDoctorsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedHospitalId) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    const query = new URLSearchParams();
    if (patientCoords) {
      query.set('lat', String(patientCoords.lat));
      query.set('lng', String(patientCoords.lng));
    }

    fetch(`/api/hospitals/${encodeURIComponent(selectedHospitalId)}?${query.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load hospital details.');
        return data;
      })
      .then((data: HospitalDetail) => {
        if (!cancelled) setHospital(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load hospital details.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    void loadDoctors(selectedHospitalId);

    return () => {
      cancelled = true;
    };
  }, [selectedHospitalId, patientCoords, loadDoctors]);

  const activeHold = myHolds.find(
    (h) =>
      (h.hospitalId === selectedHospitalId || (hospital?.code && h.hospitalId === hospital.code)) &&
      ['queued', 'pending', 'confirmed'].includes(h.status)
  );

  const handleRequestBed = async () => {
    if (!selectedHospitalId || requestingBed || activeHold) return;
    setRequestingBed(true);
    setBedMessage(null);
    try {
      const res = await fetch('/api/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: selectedHospitalId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to request bed');
      }

      await loadPatientHolds();
      if (data.status === 'pending') {
        setBedMessage({
          type: 'success',
          text: 'Bed hold requested! A bed is reserved for you pending hospital confirmation (90s window).',
        });
      } else if (data.status === 'queued') {
        setBedMessage({
          type: 'success',
          text: `You have been added to the queue at position ${data.queuePosition ?? 1}. You will be automatically promoted as beds become available.`,
        });
      }
    } catch (err) {
      setBedMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not request bed.',
      });
      await loadPatientHolds();
    } finally {
      setRequestingBed(false);
    }
  };

  const formatAddress = (addr?: HospitalDetail['address']) => {
    if (!addr) return 'New Delhi, India';
    if (typeof addr === 'string') return addr;
    return [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean).join(', ');
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      {/* Back button */}
      <div>
        <button
          onClick={() => setActiveTab('hospitals')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to hospital directory</span>
        </button>
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Unable to load hospital details</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : loading || !hospital ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500 space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent mx-auto" />
          <p className="font-semibold text-slate-700">Loading comprehensive hospital profile…</p>
        </div>
      ) : (
        <>
          {/* Main Hospital Header Card */}
          <header className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 shadow-sm">
                  <Building2 className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900">{hospital.name}</h1>
                    {hospital.code && (
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-mono font-bold text-slate-600">
                        {hospital.code}
                      </span>
                    )}
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      hospital.status.toLowerCase() === 'active' || hospital.status.toLowerCase() === 'available'
                        ? 'bg-emerald-100 text-emerald-800'
                        : hospital.status.toLowerCase() === 'busy' || hospital.status.toLowerCase() === 'limited'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {hospital.status.toUpperCase()}
                    </span>
                  </div>

                  <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>{formatAddress(hospital.address)}</span>
                  </p>

                  {hospital.distanceKm !== null && hospital.distanceKm !== undefined && (
                    <p className="mt-1 text-xs font-semibold text-sky-700">
                      ~{hospital.distanceKm} km from your current location
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons: Request Bed, Get Directions, Emergency Hotline */}
              <div className="flex flex-col sm:flex-row gap-3 shrink-0 items-stretch sm:items-center">
                {/* Request Bed Button (Rule A disabled states) */}
                {activeHold?.status === 'confirmed' ? (
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800 cursor-not-allowed opacity-90 shadow-xs"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Bed Confirmed</span>
                  </button>
                ) : activeHold?.status === 'pending' ? (
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-800 cursor-not-allowed opacity-90 shadow-xs"
                  >
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span>Request pending</span>
                  </button>
                ) : activeHold?.status === 'queued' ? (
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-800 cursor-not-allowed opacity-90 shadow-xs"
                  >
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span>In queue, position {activeHold.queuePosition ?? 1}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleRequestBed}
                    disabled={requestingBed}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E5A8E] hover:bg-[#16436b] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-900/20 transition active:scale-98 disabled:opacity-60"
                  >
                    <BedDouble className="h-4 w-4" />
                    <span>{requestingBed ? 'Submitting…' : 'Request bed'}</span>
                  </button>
                )}

                <a
                  href={hospital.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-xs transition hover:bg-slate-50"
                >
                  <Navigation className="h-4 w-4 text-sky-600" />
                  <span>Directions</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                </a>

                {hospital.contact?.emergencyHotline && (
                  <a
                    href={`tel:${hospital.contact.emergencyHotline}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
                  >
                    <Phone className="h-4 w-4" />
                    <span>Hotline</span>
                  </a>
                )}
              </div>
            </div>

            {bedMessage && (
              <div
                className={`mt-4 rounded-xl p-4 text-xs font-semibold flex items-center gap-2.5 ${
                  bedMessage.type === 'success'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border border-rose-200 bg-rose-50 text-rose-900'
                }`}
              >
                {bedMessage.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span>{bedMessage.text}</span>
              </div>
            )}
          </header>

          {/* Grid: Contact details & Bed capacity */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Contact Details Card */}
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                <Phone className="h-5 w-5 text-sky-600" />
                <span>Contact & Communication</span>
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">Emergency Hotline</span>
                  <a
                    href={`tel:${hospital.contact?.emergencyHotline || '+91-11-2345-6790'}`}
                    className="font-bold text-rose-600 hover:underline"
                  >
                    {hospital.contact?.emergencyHotline || '+91-11-2345-6790'}
                  </a>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">Main Reception / Hospital Phone</span>
                  <a
                    href={`tel:${hospital.contact?.phone || '+91-11-2345-6789'}`}
                    className="font-semibold text-slate-800 hover:underline"
                  >
                    {hospital.contact?.phone || '+91-11-2345-6789'}
                  </a>
                </div>

                {hospital.contact?.email && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500">Official Email</span>
                    <a
                      href={`mailto:${hospital.contact.email}`}
                      className="font-medium text-sky-600 hover:underline"
                    >
                      {hospital.contact.email}
                    </a>
                  </div>
                )}

                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Facility Status</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4" /> 24/7 Emergency Care Ready
                  </span>
                </div>
              </div>
            </article>

            {/* Bed & Critical Care Capacity Card */}
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                <BedDouble className="h-5 w-5 text-sky-600" />
                <span>Live Bed & Critical Care Capacity</span>
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <span className="text-xs font-semibold text-slate-500 uppercase">ICU Beds</span>
                  <p className="mt-1 text-2xl font-black text-rose-600">
                    {hospital.beds.icu.available}
                    <span className="text-xs font-normal text-slate-400"> /{hospital.beds.icu.total}</span>
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Trauma Units</span>
                  <p className="mt-1 text-2xl font-black text-amber-600">
                    {hospital.beds.trauma.available}
                    <span className="text-xs font-normal text-slate-400"> /{hospital.beds.trauma.total}</span>
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <span className="text-xs font-semibold text-slate-500 uppercase">General Beds</span>
                  <p className="mt-1 text-2xl font-black text-sky-600">
                    {hospital.beds.general.available}
                    <span className="text-xs font-normal text-slate-400"> /{hospital.beds.general.total}</span>
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Ventilators</span>
                  <p className="mt-1 text-2xl font-black text-indigo-600">
                    {hospital.beds.ventilators.available}
                    <span className="text-xs font-normal text-slate-400"> /{hospital.beds.ventilators.total}</span>
                  </p>
                </div>
              </div>
            </article>
          </div>

          {/* Doctors and specialists Section (Task 3) */}
          <article className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <UserCheck className="h-5 w-5 text-sky-600" />
                  <span>Doctors and specialists</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Specialist physicians and medical faculty registered with {hospital.name}
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {doctors.length} {doctors.length === 1 ? 'doctor registered' : 'doctors registered'}
              </span>
            </div>

            {doctorsLoading ? (
              <div className="rounded-2xl bg-slate-50 p-6 text-center text-xs text-slate-500">
                Loading doctors…
              </div>
            ) : doctors.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {doctors.map((doc) => {
                  const isAvail = doc.availability === 'available';
                  const isOnCall = doc.availability === 'on_call';
                  return (
                    <div
                      key={doc.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-sky-300 transition-colors"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{doc.name}</p>
                            <p className="text-xs font-medium text-slate-500 mt-0.5">{doc.qualification}</p>
                          </div>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                              isAvail
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isOnCall
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isAvail ? 'bg-emerald-500' : isOnCall ? 'bg-amber-500' : 'bg-slate-400'
                              }`}
                            />
                            {isAvail ? 'Available' : isOnCall ? 'On Call' : 'Off Duty'}
                          </span>
                        </div>

                        <div className="mt-2.5">
                          <span className="inline-block rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                            {doc.specialization}
                          </span>
                        </div>

                        {doc.experienceYears !== undefined && doc.experienceYears > 0 && (
                          <p className="mt-2 text-xs text-slate-500">
                            {doc.experienceYears} years experience
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500 font-medium">
                No doctor information added by this hospital yet
              </div>
            )}
          </article>

          {/* Departments & Specialties Tag Card */}
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Stethoscope className="h-5 w-5 text-violet-600" />
              <span>Clinical Specialties & Departments</span>
            </h2>
            <div className="flex flex-wrap gap-2 pt-1">
              {hospital.specialties.map((spec) => (
                <span
                  key={spec}
                  className="rounded-xl border border-violet-100 bg-violet-50/80 px-3 py-1.5 text-xs font-semibold text-violet-800"
                >
                  {spec}
                </span>
              ))}
            </div>
          </article>
        </>
      )}
    </section>
  );
}
