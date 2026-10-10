'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Siren } from '../icons';
import { useCareLink } from '../../context/CareLinkContext';

type PatientSOS = { id: string; status: string; incidentType: string; location?: { latitude: number; longitude: number }; requiredEquipment?: string[] };
type Match = { hospitalId: string; name: string; score: number; travelTimeMinutes: number | null; matchedResources: string[]; status: string };

export function PatientSmartMatch() {
  const { setActiveTab } = useCareLink();
  const [request, setRequest] = useState<PatientSOS | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requestResponse = await fetch('/api/sos', { cache: 'no-store' });
      const requestData = await requestResponse.json().catch(() => ({}));
      if (!requestResponse.ok) throw new Error(requestData.error || 'Could not load your emergency request.');
      const latest = (Array.isArray(requestData.requests) ? requestData.requests : []).find((item: PatientSOS) => item.location);
      setRequest(latest ?? null);
      if (!latest?.location) {
        setMatches([]);
        return;
      }
      const matchResponse = await fetch('/api/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyType: latest.incidentType,
          ambulanceLocation: { latitude: latest.location.latitude, longitude: latest.location.longitude },
          requiredResources: latest.requiredEquipment ?? [],
        }),
      });
      const matchData = await matchResponse.json().catch(() => ({}));
      if (!matchResponse.ok) throw new Error(matchData.error || 'Could not find hospital matches right now.');
      setMatches(Array.isArray(matchData.ranked) ? matchData.ranked : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not find hospital matches right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(initial); }, [refresh]);

  return <section className="mx-auto max-w-4xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-sky-50 p-3 text-sky-700"><Activity className="h-6 w-6" /></span><div><h1 className="text-xl font-bold text-slate-900">Smart Match</h1><p className="mt-1 text-sm text-slate-500">Hospital matches based on your latest request and live registered resources.</p></div></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
    </header>
    {loading && <p role="status" className="rounded-xl bg-white p-5 text-sm text-slate-500">Finding matches…</p>}
    {!loading && error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{error}</p><button type="button" onClick={() => void refresh()} className="mt-2 font-bold underline">Try again</button></div>}
    {!loading && !error && !request && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><Siren className="mx-auto h-8 w-8 text-sky-700" /><h2 className="mt-3 font-bold text-slate-900">No patient request to match yet</h2><p className="mt-1 text-sm text-slate-500">Create an emergency request first. Smart Match will use its location and care needs.</p><button type="button" onClick={() => setActiveTab('requests')} className="mt-4 rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white">View requests</button></div>}
    {!loading && !error && request && <>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Matching request</p><p className="mt-1 font-semibold text-slate-900">{request.incidentType} · {request.status}</p></div>
      {!matches.length ? <p className="rounded-xl bg-white p-5 text-sm text-slate-600">No registered hospital matches are available for this request right now.</p> : <div className="space-y-3">{matches.map((match) => <article key={match.hospitalId} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-slate-900">{match.name}</h2><span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-bold text-sky-800">{match.score}% match</span></div><p className="mt-1 text-xs text-slate-500">{match.status}{match.travelTimeMinutes === null ? '' : ` · estimated ${Math.round(match.travelTimeMinutes)} min travel`}</p>{match.matchedResources.length > 0 && <p className="mt-3 text-sm text-slate-700">Matched resources: {match.matchedResources.join(', ')}</p>}</article>)}</div>}
    </>}
  </section>;
}
