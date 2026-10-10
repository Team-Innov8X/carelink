'use client';

import { useEffect, useState } from 'react';
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
  X,
} from '../icons';
import { useCareLink } from '../../context/CareLinkContext';

type DoctorInfo = {
  id: string;
  name: string;
  specialization: string;
  qualification?: string;
  availability?: string;
  experienceYears?: number;
  description?: string;
  available: boolean;
  status: string;
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
  directionsUrl: string | null;
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

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPatientCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { window.setTimeout(() => { try { const saved = localStorage.getItem('carelink_last_location'); if (saved) setPatientCoords(JSON.parse(saved) as { lat: number; lng: number }); } catch { /* no saved location */ } }, 0); },
        { timeout: 8000 }
      );
    } else {
      window.setTimeout(() => { try { const saved = localStorage.getItem('carelink_last_location'); if (saved) setPatientCoords(JSON.parse(saved) as { lat: number; lng: number }); } catch { /* no saved location */ } }, 0);
    }
  }, []);

  useEffect(() => {
    if (!selectedHospitalId) return;
    let cancelled = false;
    // Data loading starts from this effect; keep the existing detail card stable while the request refreshes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError('');

    const query = new URLSearchParams();
    if (patientCoords) {
      query.set('lat', String(patientCoords.lat));
      query.set('lng', String(patientCoords.lng));
    }

    Promise.all([
      fetch(`/api/hospitals/${encodeURIComponent(selectedHospitalId)}?${query.toString()}`, { cache: 'no-store' }),
      fetch(`/api/hospitals/${encodeURIComponent(selectedHospitalId)}/doctors`, { cache: 'no-store' }),
    ])
      .then(async ([hospitalResponse, doctorResponse]) => {
        const [data, doctorData] = await Promise.all([hospitalResponse.json(), doctorResponse.json()]);
        if (!hospitalResponse.ok) throw new Error(data.error || 'Failed to load hospital details.');
        if (!doctorResponse.ok) throw new Error(doctorData.error || 'Failed to load hospital doctors.');
        return { ...data, doctors: doctorData.doctors ?? [] } as HospitalDetail;
      })
      .then((data) => { if (!cancelled) setHospital(data); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load hospital details.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedHospitalId, patientCoords]);

  const formatAddress = (addr?: HospitalDetail['address']) => {
    if (!addr) return 'Address not provided';
    if (typeof addr === 'string') return addr;
    return [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean).join(', ');
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setActiveTab('hospitals')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to hospital directory</span>
        </button>
        <button type="button" onClick={() => setActiveTab('hospitals')} aria-label="Close hospital details" title="Close hospital details" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
          <X className="h-5 w-5" />
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

              {/* Get Directions Action Button */}
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                {hospital.directionsUrl && (
                <a
                  href={hospital.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500 hover:shadow-xl"
                >
                  <Navigation className="h-4 w-4" />
                  <span>Get Directions</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                </a>
                )}

                {hospital.contact?.emergencyHotline && (
                  <a
                    href={`tel:${hospital.contact.emergencyHotline}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
                  >
                    <Phone className="h-4 w-4" />
                    <span>Emergency Hotline</span>
                  </a>
                )}
              </div>
            </div>
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
                  {hospital.contact?.emergencyHotline && <a
                    href={`tel:${hospital.contact.emergencyHotline}`}
                    className="font-bold text-rose-600 hover:underline"
                  >
                    {hospital.contact.emergencyHotline}
                  </a>}
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">Main Reception / Hospital Phone</span>
                  {hospital.contact?.phone && <a
                    href={`tel:${hospital.contact.phone}`}
                    className="font-semibold text-slate-800 hover:underline"
                  >
                    {hospital.contact.phone}
                  </a>}
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

          {/* Doctors & Clinical Specialists Roster Card */}
          <article className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <UserCheck className="h-5 w-5 text-sky-600" />
                  <span>On-Duty Doctors & Specialists</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Doctor information provided by {hospital.name}
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {hospital.doctors.length} Doctors Registered
              </span>
            </div>

            {hospital.doctors.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {hospital.doctors.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-sky-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-slate-900 text-sm">{doc.name}</p>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          doc.available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${doc.available ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {doc.availability ? doc.availability.replace('_', ' ') : doc.available ? 'Available' : 'On call'}
                        </span>
                      </div>

                      <div className="mt-2">
                        {doc.qualification && <p className="mb-1 text-xs text-slate-600">{doc.qualification}{doc.experienceYears !== undefined ? ` · ${doc.experienceYears} years` : ''}</p>}
                        <span className="inline-block rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                          {doc.specialization}
                        </span>
                      </div>

                      {doc.description && (
                        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                          {doc.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No doctor information added by this hospital yet.
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
