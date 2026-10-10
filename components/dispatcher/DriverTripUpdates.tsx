'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw } from '@/components/icons';
import { useCareLink } from '../../context/CareLinkContext';

type TripUpdate = { id: string; patientName: string; status: string; driverAssigned?: boolean; tripStage?: string; tripTimestamps?: Record<string, string>; vitalsUpdate?: { bp: string; heartRate: number; spO2: number; updatedAt: string }; issue?: { message: string; updatedAt: string; etaDelayMinutes?: number } };

export function DriverTripUpdates() {
  const { role } = useCareLink();
  const [updates, setUpdates] = useState<TripUpdate[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sos', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error('Could not load driver updates.');
      setUpdates((result.requests ?? []).filter((item: TripUpdate) => item.driverAssigned && item.status === 'accepted'));
      setError('');
    } catch { setError('Driver trip updates are temporarily unavailable.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (role !== 'dispatcher') return; const timer = window.setTimeout(() => void refresh(), 0); const interval = window.setInterval(() => void refresh(), 5000); return () => { window.clearTimeout(timer); window.clearInterval(interval); }; }, [refresh, role]);
  if (role !== 'dispatcher') return null;
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Driver trip updates</h2><p className="mt-1 text-xs text-slate-500">Vitals, handoff progress, and reported delays</p></div><Activity className="h-5 w-5 text-sky-700" /></div>{error && <p role="status" className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}<button type="button" onClick={() => void refresh()} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-white px-3 font-semibold"><RefreshCw className="h-3.5 w-3.5" />Retry</button></p>}{loading ? <p className="mt-3 text-sm text-slate-500">Loading driver updates…</p> : updates.length ? <div className="mt-3 space-y-2">{updates.map((item) => <article key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{item.patientName}</p><span className="text-xs font-semibold capitalize text-sky-800">{item.tripStage?.replaceAll('_', ' ') || 'accepted'}</span></div>{item.tripTimestamps && <p className="mt-1 text-[11px] text-slate-500">{Object.entries(item.tripTimestamps).map(([stage, at]) => `${stage.replaceAll('_', ' ')} ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).join(' · ')}</p>}{item.vitalsUpdate && <p className="mt-1 text-xs text-slate-700">BP {item.vitalsUpdate.bp} · HR {item.vitalsUpdate.heartRate} bpm · SpO₂ {item.vitalsUpdate.spO2}%</p>}{item.issue && <p className="mt-1 flex items-center gap-1 text-xs text-amber-900"><AlertTriangle className="h-3.5 w-3.5" />{item.issue.message}{item.issue.etaDelayMinutes ? ` · ETA delay +${item.issue.etaDelayMinutes} min` : ''}</p>}</article>)}</div> : <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No active driver trips.</p>}</section>;
}
