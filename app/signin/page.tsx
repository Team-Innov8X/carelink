'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Lock, UserRound, ChevronDown } from 'lucide-react';
import { authClient } from '../../lib/auth-client';
import { routeForRole } from '../../lib/role-route';

const accountTypes = [
  ['patient', 'Patient'],
  ['hospital_staff', 'Hospital admin'],
  ['pharmacy', 'Pharmaceuticals'],
  ['driver', 'Driver'],
];

const inputClass = 'w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700';

export default function SignInPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState('patient');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = identifier.includes('@')
        ? await authClient.signIn.email({ email: identifier, password })
        : await authClient.signIn.username({ username: identifier, password });

      if (result.error) throw new Error(result.error.message || 'Sign in failed. Check your credentials.');
      const signedInRole = (result.data?.user as (typeof result.data.user & { role?: string }) | undefined)?.role || accountType;
      if (routeForRole(signedInRole) !== routeForRole(accountType)) {
        await authClient.signOut();
        throw new Error('That account belongs to a different workspace. Choose the matching account type.');
      }
      router.push(routeForRole(signedInRole));
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSubmitting(true);
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: routeForRole(accountType),
      });
      if (result.error) throw new Error(result.error.message || 'Google sign in is unavailable.');
      if (result.data?.url) window.location.assign(result.data.url);
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : 'Google sign in is unavailable.');
      setSubmitting(false);
    }
  };

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
            <h2 className="mb-3 mt-10 text-2xl font-bold leading-snug tracking-tight lg:text-3xl">Welcome back.</h2>
            <p className="max-w-sm text-sm leading-relaxed text-slate-300">Sign in to continue to your CareLink workspace.</p>
          </div>
        </aside>

        <div className="overflow-y-auto p-8 md:min-h-0 lg:p-10">
          <header className="mb-6"><h2 className="text-2xl font-bold text-slate-900">Sign in</h2><p className="mt-1 text-sm text-slate-500">Access your care workspace</p></header>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div><label className={labelClass} htmlFor="signin-identifier">Username or email</label><div className="relative"><UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signin-identifier" className={inputClass} required autoComplete="username" value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="Your username or email" /></div></div>
            <div><label className={labelClass} htmlFor="signin-password">Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signin-password" className={inputClass} type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" /></div></div>
            <div><label className={labelClass} htmlFor="signin-role">Role</label><div className="relative"><select id="signin-role" value={accountType} onChange={event => setAccountType(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">{accountTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div></div>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={submitting} className="mt-2 w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="relative my-5 text-center"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div><span className="relative bg-white px-3 text-xs font-medium uppercase text-slate-400">or</span></div>
          <button type="button" disabled={submitting} onClick={handleGoogleSignIn} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"><span className="text-base font-bold">G</span> Continue with Google</button>
          <p className="mt-6 text-center text-xs text-slate-400">New to CareLink? <Link href="/signup" className="font-semibold text-sky-600 hover:underline">Create an account</Link></p>
        </div>
      </section>
    </main>
  );
}
