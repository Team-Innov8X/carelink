'use client';
import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';

function ResetForm() {
  const params = useSearchParams(); const token = params.get('token') || '';
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setMessage(''); if (password.length < 8 || password.length > 32) { setMessage('Use a password with 8 to 32 characters.'); return; } if (password !== confirm) { setMessage('Passwords do not match.'); return; } if (!token) { setMessage('This reset link is invalid or expired. Request a new link.'); return; } setBusy(true);
    try { const result = await authClient.resetPassword({ newPassword: password, token }); if (result.error) throw new Error(result.error.message); setMessage('Password updated. You can now sign in.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'This reset link is invalid or expired. Request a new link.'); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-2xl font-bold">Choose a new password</h1><p className="mt-2 text-sm text-slate-600">Use 8 to 32 characters.</p><form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-sm font-semibold">New password<input type="password" required minLength={8} maxLength={32} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label><label className="block text-sm font-semibold">Confirm password<input type="password" required minLength={8} maxLength={32} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label><button disabled={busy} className="rounded-lg bg-sky-800 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Updating…' : 'Update password'}</button></form>{message && <p role="status" className="mt-4 text-sm text-slate-700">{message}</p>}<Link href="/signin" className="mt-4 inline-block text-sm font-semibold text-sky-800 underline">Sign in</Link></main>;
}
export default function ResetPasswordPage() { return <Suspense fallback={<main className="mx-auto mt-16 max-w-md p-6">Loading reset form…</main>}><ResetForm /></Suspense>; }
