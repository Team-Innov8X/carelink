'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Lock, UserRound } from '@/components/icons';
import { authClient } from '../../lib/auth-client';
import { routeForRole } from '../../lib/role-route';

const inputClass = 'w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700';

export default function SignInPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const normalizedIdentifier = identifier.trim();
      const result = await authClient.signIn.email({ email: normalizedIdentifier.toLowerCase(), password });

      if (result.error) throw new Error(result.error.message || 'Sign in failed. Check your credentials.');
      const signedInRole = (result.data?.user as (typeof result.data.user & { role?: string }) | undefined)?.role || 'patient';
      router.replace(routeForRole(signedInRole));
      router.refresh();
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
        callbackURL: '/auth/complete',
      });
      if (result.error) throw new Error(result.error.message || 'Google sign in is unavailable.');
      if (result.data?.url) window.location.assign(result.data.url);
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : 'Google sign in is unavailable.');
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-100 px-4 pb-8 pt-24 sm:p-8">
      <Link href="/" aria-label="CareLink home" className="absolute left-5 top-5 flex items-center gap-3 sm:left-8 sm:top-7">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white shadow-md shadow-rose-200">
          <Heart className="h-5 w-5 fill-white" />
        </span>
        <span className="text-xl font-black tracking-tight text-slate-900">Care<span className="text-rose-600">Link</span></span>
      </Link>
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-lg sm:p-9">
        <div>
          <header className="mb-6"><h2 className="text-2xl font-bold text-slate-900">Sign in</h2><p className="mt-1 text-sm text-slate-500">Access your care workspace</p></header>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div><label className={labelClass} htmlFor="signin-identifier">Email</label><div className="relative"><UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signin-identifier" className={inputClass} type="email" required autoComplete="email" value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="name@example.com" /></div></div>
            <div><label className={labelClass} htmlFor="signin-password">Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="signin-password" className={inputClass} type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" /></div></div>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={submitting} className="mt-2 w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <Link href="/forgot-password" className="mt-3 block text-right text-xs font-semibold text-sky-700 hover:underline">Reset password</Link>
          <div className="relative my-5 text-center"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div><span className="relative bg-white px-3 text-xs font-medium uppercase text-slate-400">or</span></div>
          <button type="button" disabled={submitting} onClick={handleGoogleSignIn} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"><svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 3.01 13.22l7.98 6.19C12.9 13.72 18.02 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.72 6C44.42 37.95 46.98 31.8 46.98 24.55z"/><path fill="#FBBC05" d="M10.99 28.59A14.4 14.4 0 0 1 10.25 24c0-1.59.27-3.13.74-4.59l-7.98-6.19A23.9 23.9 0 0 0 .98 24c0 3.88.93 7.55 2.57 10.78l7.44-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.72-6c-2.14 1.43-4.88 2.28-8.19 2.28-5.98 0-11.1-4.22-13.01-9.91l-7.44 6.19C7.05 43.1 15.04 48 24 48z"/></svg> Continue with Google</button>
          <p className="mt-6 text-center text-xs text-slate-400">New to CareLink? <Link href="/signup" className="font-semibold text-sky-600 hover:underline">Create an account</Link></p>
        </div>
      </section>
    </main>
  );
}
