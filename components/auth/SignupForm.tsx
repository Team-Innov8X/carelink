'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Mail, Lock, UserRound, Building2, MapPin, FileText, Stethoscope, Store, Ambulance, Phone, User } from 'lucide-react';
import { routeForRole } from '../../lib/role-route';

export default function SignupForm({ role }: { role: string }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalAddress, setHospitalAddress] = useState('');
  const [hospitalRegistrationNumber, setHospitalRegistrationNumber] = useState('');
  const [hospitalSpecialties, setHospitalSpecialties] = useState('');
  const [pharmacyName, setPharmacyName] = useState('');
  const [pharmacyAddress, setPharmacyAddress] = useState('');
  const [pharmacyLicenseNumber, setPharmacyLicenseNumber] = useState('');
  const [pharmacyType, setPharmacyType] = useState('Retail pharmacy');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverQualification, setDriverQualification] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const roleDetailsValid = () => {
    if (!name.trim() || !username.trim() || !phone.trim()) return 'Enter your name, username, and phone number first.';
    if (role === 'hospital_staff' && [hospitalName, hospitalAddress, hospitalRegistrationNumber, hospitalSpecialties].some((value) => !value.trim())) return 'Complete all hospital details before continuing.';
    if (role === 'pharmacy' && [pharmacyName, pharmacyAddress, pharmacyLicenseNumber].some((value) => !value.trim())) return 'Complete all pharmacy details before continuing.';
    if (role === 'driver' && [licenseNumber, vehicleNumber, driverQualification].some((value) => !value.trim())) return 'Complete all driver details before continuing.';
    return '';
  };

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const missingDetails = roleDetailsValid();
    if (missingDetails) { setError(missingDetails); return; }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, username, phone, email, password, role,
          ...(role === 'hospital_staff' ? { hospitalName, hospitalAddress, hospitalRegistrationNumber, hospitalSpecialties } : {}),
          ...(role === 'pharmacy' ? { pharmacyName, pharmacyAddress, pharmacyLicenseNumber, pharmacyType } : {}),
          ...(role === 'driver' ? { licenseNumber, vehicleNumber, driverQualification } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to create your account.');
      router.push(routeForRole(role));
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'Unable to create your account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    const missingDetails = roleDetailsValid();
    if (missingDetails) { setError(missingDetails); return; }
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: routeForRole(role), additionalData: {
          role, name, username, phone,
          ...(role === 'hospital_staff' ? { hospitalName, hospitalAddress, hospitalRegistrationNumber, hospitalSpecialties } : {}),
          ...(role === 'pharmacy' ? { pharmacyName, pharmacyAddress, pharmacyLicenseNumber, pharmacyType } : {}),
          ...(role === 'driver' ? { licenseNumber, vehicleNumber, driverQualification } : {}),
        } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Google sign-in is unavailable.');
      if (result.url) window.location.assign(result.url);
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : 'Google sign-in is unavailable.');
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="grid max-h-[94vh] w-full max-w-4xl grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl md:h-[94vh] md:min-h-0 md:grid-cols-2">
        <aside className="relative flex flex-col justify-start overflow-hidden bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 p-8 text-white lg:p-10">
          <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="relative">
            <div className="mb-2 flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-500 to-rose-600 shadow-lg"><Heart className="h-6 w-6 fill-white text-white" /></div>
              <div><h1 className="text-2xl font-black tracking-tight">Care<span className="text-rose-400">Link</span></h1><span className="text-[11px] font-medium text-sky-200">Faster Care, Healthier Tomorrow</span></div>
            </div>
            <h2 className="mb-3 mt-10 text-2xl font-bold leading-snug tracking-tight lg:text-3xl">Care, connected.</h2>
            <p className="max-w-sm text-sm leading-relaxed text-slate-300">One place for patients, hospitals, drivers, and pharmacies.</p>
          </div>
        </aside>

        <div className="overflow-y-auto p-6 md:min-h-0 lg:p-8">
          <header className="mb-6"><h2 className="text-2xl font-bold text-slate-900">Create your account</h2><p className="mt-1 text-sm text-slate-500">Join CareLink to coordinate better care</p></header>
          <form onSubmit={handleSignup} className="space-y-4">
            <div><label className={labelClass} htmlFor="signup-name">Full name</label><div className="relative"><User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signup-name" className={inputClass} required autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Your full name" /></div></div>
            <div><label className={labelClass} htmlFor="signup-username">Username</label><div className="relative"><UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signup-username" className={inputClass} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="e.g. care_user" /></div></div>
            <div><label className={labelClass} htmlFor="signup-phone">Phone number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signup-phone" className={inputClass} type="tel" required autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="Contact number" /></div></div>
            <div><label className={labelClass} htmlFor="signup-email">Email</label><div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signup-email" className={inputClass} type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" /></div></div>
            <div><label className={labelClass} htmlFor="signup-password">Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signup-password" className={inputClass} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="********" /></div></div>
            <div><label className={labelClass} htmlFor="confirm-password">Confirm password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="confirm-password" className={inputClass} type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="********" /></div></div>
            {role === 'hospital_staff' && <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-4"><p className="flex items-center gap-2 text-sm font-bold text-sky-900"><Building2 className="h-4 w-4" />Hospital details</p><div><label className={labelClass} htmlFor="hospital-name">Hospital name</label><div className="relative"><Building2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="hospital-name" className={inputClass} required value={hospitalName} onChange={event => setHospitalName(event.target.value)} placeholder="Registered hospital name" /></div></div><div><label className={labelClass} htmlFor="hospital-address">Hospital address</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="hospital-address" className={inputClass} required value={hospitalAddress} onChange={event => setHospitalAddress(event.target.value)} placeholder="Street, city, postal code" /></div></div><div><label className={labelClass} htmlFor="hospital-registration">Registration number</label><div className="relative"><FileText className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="hospital-registration" className={inputClass} required value={hospitalRegistrationNumber} onChange={event => setHospitalRegistrationNumber(event.target.value)} placeholder="Hospital registration / license" /></div></div><div><label className={labelClass} htmlFor="hospital-specialties">Specialties and services</label><div className="relative"><Stethoscope className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><textarea id="hospital-specialties" className={`${inputClass} min-h-20 pl-10`} required value={hospitalSpecialties} onChange={event => setHospitalSpecialties(event.target.value)} placeholder="e.g. ICU, Cardiology, Trauma Care" /></div><p className="mt-1 text-[11px] text-slate-500">Separate specialties with commas.</p></div></div>}
            {role === 'pharmacy' && <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-4"><p className="flex items-center gap-2 text-sm font-bold text-violet-900"><Store className="h-4 w-4" />Pharmacy details</p><div><label className={labelClass} htmlFor="pharmacy-name">Pharmacy name</label><div className="relative"><Store className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="pharmacy-name" className={inputClass} required value={pharmacyName} onChange={event => setPharmacyName(event.target.value)} placeholder="Registered pharmacy name" /></div></div><div><label className={labelClass} htmlFor="pharmacy-address">Pharmacy address</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="pharmacy-address" className={inputClass} required value={pharmacyAddress} onChange={event => setPharmacyAddress(event.target.value)} placeholder="Street, city, postal code" /></div></div><div><label className={labelClass} htmlFor="pharmacy-license">Pharmacy license number</label><div className="relative"><FileText className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="pharmacy-license" className={inputClass} required value={pharmacyLicenseNumber} onChange={event => setPharmacyLicenseNumber(event.target.value)} placeholder="Pharmacy registration / license" /></div></div><div><label className={labelClass} htmlFor="pharmacy-type">Pharmacy type</label><div className="relative"><Store className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select id="pharmacy-type" value={pharmacyType} onChange={event => setPharmacyType(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800"><option>Retail pharmacy</option><option>Hospital pharmacy</option><option>24-hour pharmacy</option><option>Specialty pharmacy</option></select></div></div></div>}
            {role === 'driver' && <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4"><p className="flex items-center gap-2 text-sm font-bold text-amber-900"><Ambulance className="h-4 w-4" />Driver details</p><div><label className={labelClass} htmlFor="driver-license">Driver license number</label><div className="relative"><FileText className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="driver-license" className={inputClass} required value={licenseNumber} onChange={event => setLicenseNumber(event.target.value)} placeholder="Valid driver license number" /></div></div><div><label className={labelClass} htmlFor="vehicle-number">Ambulance / vehicle number</label><div className="relative"><Ambulance className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="vehicle-number" className={inputClass} required value={vehicleNumber} onChange={event => setVehicleNumber(event.target.value)} placeholder="Vehicle registration number" /></div></div><div><label className={labelClass} htmlFor="driver-qualification">Emergency qualification</label><div className="relative"><Stethoscope className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select id="driver-qualification" value={driverQualification} onChange={event => setDriverQualification(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800"><option value="">Choose qualification</option><option>Ambulance driver</option><option>Emergency Medical Technician</option><option>Paramedic</option><option>Advanced Life Support</option></select></div></div></div>}

            <p className="rounded-xl bg-sky-50 px-3.5 py-2.5 text-sm font-semibold text-sky-800">Creating a {role === 'hospital_staff' ? 'Hospital admin' : role === 'pharmacy' ? 'Pharmacy' : role === 'driver' ? 'Driver' : 'Patient'} account</p>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={submitting} className="mt-2 w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Creating account…' : 'Create account'}</button>
          </form>
          <div className="relative my-5 text-center"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div><span className="relative bg-white px-3 text-xs font-medium uppercase text-slate-400">or</span></div>
          <button type="button" onClick={handleGoogleSignup} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"><svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 3.01 13.22l7.98 6.19C12.9 13.72 18.02 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.72 6C44.42 37.95 46.98 31.8 46.98 24.55z"/><path fill="#FBBC05" d="M10.99 28.59A14.4 14.4 0 0 1 10.25 24c0-1.59.27-3.13.74-4.59l-7.98-6.19A23.9 23.9 0 0 0 .98 24c0 3.88.93 7.55 2.57 10.78l7.44-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.72-6c-2.14 1.43-4.88 2.28-8.19 2.28-5.98 0-11.1-4.22-13.01-9.91l-7.44 6.19C7.05 43.1 15.04 48 24 48z"/></svg> Continue with Google</button>
          <p className="mt-6 text-center text-xs text-slate-400">Already have an account? <Link href="/signin" className="font-semibold text-sky-600 hover:underline">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
