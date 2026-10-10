'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { normalizeRole } from '@/lib/roles';

export default function OrganizationOnboardingPage() {
  const params = useParams<{ role: string }>(); const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const role = params.role === 'pharmacy' ? 'pharmacy' : 'hospital';
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', pincode: '', phone: '', details: '', totalBeds: 0, openingHours: '' });
  useEffect(() => {
    if (isPending) return;
    if (!session) { router.replace('/signin'); return; }
    const profile = session.user as typeof session.user & { onboardingCompleted?: boolean; role?: string; pharmacyName?: string; pharmacyLicenseNumber?: string };
    const accountRole = normalizeRole(profile.role);
    if (profile.onboardingCompleted) router.replace(role === 'hospital' ? '/hospital-admin' : '/pharmacy-dashboard');
    else if (role === 'hospital' && accountRole !== 'hospital' && accountRole !== 'hospital_staff') router.replace('/');
    else if (role === 'pharmacy' && accountRole !== 'pharmacy' && !(profile.pharmacyName && profile.pharmacyLicenseNumber)) router.replace('/');
  }, [isPending, role, router, session]);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError('');
    try { const response = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not save details.'); router.replace(role === 'hospital' ? '/hospital-admin' : '/pharmacy-dashboard'); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save details.'); setBusy(false); }
  };
  const change = (key: keyof typeof form, value: string) => setForm(old => ({ ...old, [key]: key === 'totalBeds' ? Number(value) : value }));
  const fields: [keyof typeof form, string][] = [['name', role === 'hospital' ? 'Hospital name' : 'Pharmacy name'], ['address', 'Street address'], ['city', 'City'], ['state', 'State'], ['pincode', 'Pincode'], ['phone', 'Contact number'], ['details', role === 'hospital' ? 'Departments and services' : 'Services offered'], ['openingHours', 'Opening hours']];
  return <main className="mx-auto min-h-screen max-w-2xl bg-slate-50 px-4 py-10"><form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-2xl font-bold">Complete {role} profile</h1><p className="text-sm text-slate-600">Add an address so nearby patients can find this organization.</p>{fields.map(([key, label]) => <label key={key} className="block text-sm font-semibold text-slate-700">{label}<input required value={String(form[key])} onChange={event => change(key, event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" /></label>)}{role === 'hospital' && <label className="block text-sm font-semibold text-slate-700">Total beds<input type="number" min={0} value={form.totalBeds} onChange={event => change('totalBeds', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" /></label>}{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<button disabled={busy} className="rounded-lg bg-sky-800 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save and continue'}</button></form></main>;
}
