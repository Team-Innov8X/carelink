'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setMessage('');
    try { const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/reset-password` }); if (result.error) throw new Error(result.error.message); setMessage('If an account exists for this email, a reset link will be sent.'); }
    catch { setMessage('If an account exists for this email, a reset link will be sent.'); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-2xl font-bold">Reset your password</h1><p className="mt-2 text-sm text-slate-600">We’ll send a link if an account matches.</p><form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-sm font-semibold">Email<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label><button disabled={busy} className="rounded-lg bg-sky-800 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send reset link'}</button></form>{message && <p role="status" className="mt-4 text-sm text-slate-700">{message}</p>}<Link href="/signin" className="mt-4 inline-block text-sm font-semibold text-sky-800 underline">Return to sign in</Link></main>;
}
