'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { routeForRole } from '@/lib/role-route';

export default function AuthCompletePage() {
  const params = useSearchParams();
  const [error, setError] = useState('');
  useEffect(() => {
    const role = params.get('role') || 'patient';
    void fetch('/api/me/role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
      .then(async response => { if (!response.ok && response.status !== 409) throw new Error('Could not set your account role.'); window.location.replace(routeForRole(role)); })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not complete sign-in.'));
  }, [params]);
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6"><p role={error ? 'alert' : 'status'} className="rounded-2xl bg-white p-6 text-sm text-slate-700 shadow">{error || 'Finishing sign-in…'}</p></main>;
}
