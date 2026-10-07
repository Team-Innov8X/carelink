'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MapPin, FileText, Stethoscope, Phone, Heart, ArrowRight } from 'lucide-react';

export default function HospitalDetailsPage() {
  const router = useRouter();
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalAddress, setHospitalAddress] = useState('');
  const [hospitalRegistrationNumber, setHospitalRegistrationNumber] = useState('');
  const [hospitalSpecialties, setHospitalSpecialties] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!hospitalName.trim() || !hospitalAddress.trim() || !hospitalRegistrationNumber.trim()) {
      setError('Please provide hospital name, address, and registration number.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/onboarding/hospital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitalName: hospitalName.trim(),
          hospitalAddress: hospitalAddress.trim(),
          hospitalRegistrationNumber: hospitalRegistrationNumber.trim(),
          hospitalSpecialties: hospitalSpecialties.trim(),
          phone: phone.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save hospital details.');
      }

      router.replace(data.redirectUrl || '/hospital-admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-100 bg-gradient-to-r from-sky-900 to-slate-900 p-6 text-white sm:p-8">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 shadow-md">
              <Heart className="h-5 w-5 fill-white" />
            </div>
            <span className="text-xl font-black">Care<span className="text-rose-400">Link</span></span>
          </div>
          <h1 className="text-2xl font-bold text-white">Hospital facility onboarding</h1>
          <p className="mt-1 text-sm text-sky-200">
            Welcome to CareLink. Please enter your registered facility details to activate hospital operations and capacity controls.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
          <div>
            <label className={labelClass} htmlFor="hospital-name">Hospital Name *</label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="hospital-name"
                className={inputClass}
                required
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder="e.g. City General Hospital"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="hospital-address">Full Hospital Address *</label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="hospital-address"
                className={inputClass}
                required
                value={hospitalAddress}
                onChange={(e) => setHospitalAddress(e.target.value)}
                placeholder="Street address, City, Postal code"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="hospital-reg">Registration / License Number *</label>
            <div className="relative">
              <FileText className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="hospital-reg"
                className={inputClass}
                required
                value={hospitalRegistrationNumber}
                onChange={(e) => setHospitalRegistrationNumber(e.target.value)}
                placeholder="Medical council registration / facility license"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="hospital-specialties">Specialties & Available Departments</label>
            <div className="relative">
              <Stethoscope className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <textarea
                id="hospital-specialties"
                className={`${inputClass} min-h-20 pl-10`}
                value={hospitalSpecialties}
                onChange={(e) => setHospitalSpecialties(e.target.value)}
                placeholder="e.g. ICU, Emergency Medicine, Cardiology, Trauma Care"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Comma-separated list of active clinical specialties.</p>
          </div>

          <div>
            <label className={labelClass} htmlFor="hospital-phone">Emergency Hotline / Main Contact Phone (Optional)</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="hospital-phone"
                className={inputClass}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91-11-2345-6789"
              />
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500 disabled:opacity-60"
          >
            {submitting ? 'Saving facility details…' : 'Complete Setup & Open Dashboard'}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </main>
  );
}
