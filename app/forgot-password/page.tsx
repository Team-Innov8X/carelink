'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: `${window.location.origin}/reset-password` });
      if (result.error) throw new Error(result.error.message || 'Unable to request a reset.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to request a reset.'); }
    finally { setSent(true); setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl"><h1 className="text-2xl font-bold text-slate-900">Forgot password?</h1>{sent ? <p role="status" className="mt-4 text-sm text-slate-600">If an account exists for that email, we’ve sent a password reset link.</p> : <form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-sm font-semibold text-slate-700">Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-sky-700 py-3 font-semibold text-white">{busy ? 'Sending…' : 'Send reset link'}</button></form>}<Link className="mt-5 block text-sm text-sky-700" href="/signin">Back to sign in</Link></section></main>;
}
