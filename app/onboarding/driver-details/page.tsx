'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ambulance, FileText, Stethoscope, Phone, Heart, ArrowRight } from 'lucide-react';

export default function DriverDetailsPage() {
  const router = useRouter();
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverQualification, setDriverQualification] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!licenseNumber.trim() || !vehicleNumber.trim() || !driverQualification.trim()) {
      setError('Please provide license number, vehicle number, and qualification.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/onboarding/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseNumber: licenseNumber.trim(),
          vehicleNumber: vehicleNumber.trim(),
          driverQualification: driverQualification.trim(),
          phone: phone.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save driver details.');
      }

      router.replace(data.redirectUrl || '/driver-dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-100 bg-gradient-to-r from-amber-900 to-slate-900 p-6 text-white sm:p-8">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 shadow-md">
              <Heart className="h-5 w-5 fill-white" />
            </div>
            <span className="text-xl font-black">Care<span className="text-amber-400">Link</span></span>
          </div>
          <h1 className="text-2xl font-bold text-white">Emergency driver registration</h1>
          <p className="mt-1 text-sm text-amber-200">
            Welcome to CareLink. Please enter your driver credentials and ambulance details to receive live SOS dispatch alerts.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
          <div>
            <label className={labelClass} htmlFor="driver-license">Driver License Number *</label>
            <div className="relative">
              <FileText className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="driver-license"
                className={inputClass}
                required
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="Commercial / heavy vehicle driving license"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="vehicle-num">Vehicle / Ambulance Number *</label>
            <div className="relative">
              <Ambulance className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="vehicle-num"
                className={inputClass}
                required
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="e.g. DL-01-AB-1234"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="driver-qual">Emergency Medical Qualification *</label>
            <div className="relative">
              <Stethoscope className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                id="driver-qual"
                required
                value={driverQualification}
                onChange={(e) => setDriverQualification(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800"
              >
                <option value="">Choose qualification</option>
                <option>Ambulance driver</option>
                <option>Emergency Medical Technician</option>
                <option>Paramedic</option>
                <option>Advanced Life Support</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="driver-phone">Contact Phone (Optional)</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="driver-phone"
                className={inputClass}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91-98765-43210"
              />
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-500 disabled:opacity-60"
          >
            {submitting ? 'Saving driver profile…' : 'Complete Setup & Go Live'}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </main>
  );
}
