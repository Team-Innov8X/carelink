'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Store, MapPin, FileText, Phone, Heart, ArrowRight } from 'lucide-react';

export default function PharmacyDetailsPage() {
  const router = useRouter();
  const [pharmacyName, setPharmacyName] = useState('');
  const [pharmacyAddress, setPharmacyAddress] = useState('');
  const [pharmacyLicenseNumber, setPharmacyLicenseNumber] = useState('');
  const [pharmacyType, setPharmacyType] = useState('Retail pharmacy');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!pharmacyName.trim() || !pharmacyAddress.trim() || !pharmacyLicenseNumber.trim()) {
      setError('Please provide pharmacy name, address, and license number.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/onboarding/pharmacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pharmacyName: pharmacyName.trim(),
          pharmacyAddress: pharmacyAddress.trim(),
          pharmacyLicenseNumber: pharmacyLicenseNumber.trim(),
          pharmacyType,
          phone: phone.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save pharmacy details.');
      }

      router.replace(data.redirectUrl || '/pharmacy-dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-100 bg-gradient-to-r from-violet-900 to-slate-900 p-6 text-white sm:p-8">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 shadow-md">
              <Heart className="h-5 w-5 fill-white" />
            </div>
            <span className="text-xl font-black">Care<span className="text-violet-400">Link</span></span>
          </div>
          <h1 className="text-2xl font-bold text-white">Pharmacy facility onboarding</h1>
          <p className="mt-1 text-sm text-violet-200">
            Welcome to CareLink. Please enter your pharmacy license and location details to connect with emergency prescription requests.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
          <div>
            <label className={labelClass} htmlFor="pharmacy-name">Pharmacy Name *</label>
            <div className="relative">
              <Store className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="pharmacy-name"
                className={inputClass}
                required
                value={pharmacyName}
                onChange={(e) => setPharmacyName(e.target.value)}
                placeholder="e.g. Apollo Pharmacy Central"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="pharmacy-address">Full Pharmacy Address *</label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="pharmacy-address"
                className={inputClass}
                required
                value={pharmacyAddress}
                onChange={(e) => setPharmacyAddress(e.target.value)}
                placeholder="Street address, City, Postal code"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="pharmacy-license">Drug License Number *</label>
            <div className="relative">
              <FileText className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="pharmacy-license"
                className={inputClass}
                required
                value={pharmacyLicenseNumber}
                onChange={(e) => setPharmacyLicenseNumber(e.target.value)}
                placeholder="State pharmacy board license number"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="pharmacy-type">Pharmacy Type</label>
            <div className="relative">
              <Store className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                id="pharmacy-type"
                value={pharmacyType}
                onChange={(e) => setPharmacyType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800"
              >
                <option>Retail pharmacy</option>
                <option>Hospital pharmacy</option>
                <option>24-hour pharmacy</option>
                <option>Specialty pharmacy</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="pharmacy-phone">Contact Phone (Optional)</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="pharmacy-phone"
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
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500 disabled:opacity-60"
          >
            {submitting ? 'Saving details…' : 'Complete Setup & Open Pharmacy'}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </main>
  );
}
