'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { routeForRole } from '@/lib/role-route';

function AuthCompleteForm() {
  const params = useSearchParams();
  const [error, setError] = useState('');
  useEffect(() => {
    const signupRole = params.get('role');
    const complete = async () => {
      if (signupRole) {
        const response = await fetch('/api/me/role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: signupRole }) });
        if (!response.ok && response.status !== 409) throw new Error('Could not set your account role.');
        window.location.replace(routeForRole(signupRole));
        return;
      }
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load your signed-in account.');
      const result = await response.json() as { user?: { role?: string } };
      window.location.replace(routeForRole(result.user?.role));
    };
    void complete().catch(e => setError(e instanceof Error ? e.message : 'Could not complete sign-in.'));
  }, [params]);
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6"><p role={error ? 'alert' : 'status'} className="rounded-2xl bg-white p-6 text-sm text-slate-700 shadow">{error || 'Finishing sign-in…'}</p></main>;
}

export default function AuthCompletePage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">Finishing sign-in…</main>}><AuthCompleteForm /></Suspense>;
}
