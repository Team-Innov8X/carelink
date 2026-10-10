'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 8 || password.length > 32) { setError('Password must be 8–32 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try { const result = await authClient.resetPassword({ newPassword: password, token }); if (result.error) throw new Error(result.error.message || 'This reset link is invalid or expired.'); setMessage('Password updated. You can now sign in.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'This reset link is invalid or expired.'); }
    finally { setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl"><h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>{message ? <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p> : <form onSubmit={submit} className="mt-5 space-y-4"><p className="text-sm text-slate-600">Use 8–32 characters.</p><label className="block text-sm font-semibold text-slate-700">New password<input required type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label><label className="block text-sm font-semibold text-slate-700">Confirm password<input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<button disabled={busy || !token} className="w-full rounded-xl bg-sky-700 py-3 font-semibold text-white">{busy ? 'Updating…' : 'Update password'}</button></form>}<Link className="mt-5 block text-sm text-sky-700" href="/signin">Back to sign in</Link></section></main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">Loading reset form…</main>}><ResetPasswordForm /></Suspense>;
}
