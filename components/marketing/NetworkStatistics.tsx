'use client';

import { useEffect, useState } from 'react';

type NetworkCounts = { members: number; hospitals: number; pharmacies: number; drivers: number };

const metrics: { key: keyof NetworkCounts; label: string }[] = [
  { key: 'members', label: 'CareLink members' },
  { key: 'hospitals', label: 'Registered hospitals' },
  { key: 'pharmacies', label: 'Connected pharmacies' },
  { key: 'drivers', label: 'Emergency drivers' },
];

export default function NetworkStatistics() {
  const [counts, setCounts] = useState<NetworkCounts | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public-stats', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: NetworkCounts) => setCounts(data))
      .catch(() => { if (!controller.signal.aborted) setCounts(null); });
    return () => controller.abort();
  }, []);

  return (
    <section aria-label="CareLink network" className="rounded-3xl border border-slate-200 bg-white px-6 py-9 shadow-sm sm:px-10">
      <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Care that connects, when it matters</p>
      <div className="mt-7 grid gap-7 text-center sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ key, label }) => (
          <div key={key}>
            <p className="text-3xl font-black tabular-nums text-rose-600" aria-live="polite">
              {counts ? counts[key].toLocaleString('en-IN') : '—'}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">Live counts of registered CareLink accounts and services.</p>
    </section>
  );
}
