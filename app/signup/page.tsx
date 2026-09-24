'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Mail, Lock, UserRound, ChevronDown } from 'lucide-react';
import { routeForRole } from '../../lib/role-route';

const roles = [
  ['hospital_staff', 'Hospital admin'],
  ['pharmacy', 'Pharmaceuticals'],
  ['patient', 'Patient'],
  ['driver', 'Driver'],
];

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('patient');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username, username, email, password, role }),
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
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: routeForRole(role), additionalData: { role } }),
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

        <div className="overflow-y-auto p-8 md:min-h-0 lg:p-10">
          <header className="mb-6"><h2 className="text-2xl font-bold text-slate-900">Create your account</h2><p className="mt-1 text-sm text-slate-500">Join CareLink to coordinate better care</p></header>
          <form onSubmit={handleSignup} className="space-y-4">
            <div><label className={labelClass} htmlFor="signup-username">Username</label><div className="relative"><UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signup-username" className={inputClass} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="e.g. care_user" /></div></div>
            <div><label className={labelClass} htmlFor="signup-email">Email</label><div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signup-email" className={inputClass} type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" /></div></div>
            <div><label className={labelClass} htmlFor="signup-password">Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signup-password" className={inputClass} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></div></div>
            <div><label className={labelClass} htmlFor="confirm-password">Confirm password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="confirm-password" className={inputClass} type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></div></div>
            <div><label className={labelClass} htmlFor="signup-role">Role</label><div className="relative"><select id="signup-role" value={role} onChange={event => setRole(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">{roles.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div></div>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={submitting} className="mt-2 w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Creating account…' : 'Create account'}</button>
          </form>
          <div className="relative my-5 text-center"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div><span className="relative bg-white px-3 text-xs font-medium uppercase text-slate-400">or</span></div>
          <button type="button" onClick={handleGoogleSignup} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"><span className="text-base font-bold">G</span> Continue with Google</button>
          <p className="mt-6 text-center text-xs text-slate-400">Already have an account? <Link href="/signin" className="font-semibold text-sky-600 hover:underline">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
