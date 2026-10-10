'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import conditions from '@/data/conditions.json';

type RecommendationItem = { hospitalId: string; hospitalName: string; travelTimeMinutes: number; p_available: number; p_accept: number; experienceScore: number; cost: number; reasons: string[]; fallbackFlags: string[]; location?: { latitude: number; longitude: number } };
type TimelineEvent = { status: string; at: string; reason: string; hospitalName?: string };
type RecommendationState = { conditionId: string; conditionLabel: string; status: string; ranked: RecommendationItem[]; selectedHospitalId?: string; selectedHospitalName?: string; selectedHospitalLocation?: { latitude: number; longitude: number }; responseDeadline?: string; reroutes: number; timeline: TimelineEvent[]; fallbackText?: string; unservedReason?: string; fallbackFlags: string[] };
type NearbyHospital = { id: string; name: string; travelTimeMinutes: number; directionsUrl: string; registered: boolean; label: string };

export function TripRecommendation({ tripId, tripStage, patient, driver, onDestination }: { tripId: string; tripStage: string; patient: { latitude: number; longitude: number }; driver?: { latitude: number; longitude: number } | null; onDestination: (hospital?: { latitude: number; longitude: number }) => void }) {
  const [recommendation, setRecommendation] = useState<RecommendationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conditionId, setConditionId] = useState('');
  const [overrideHospital, setOverrideHospital] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [nearby, setNearby] = useState<NearbyHospital[]>([]);
  const [clockNow, setClockNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/recommendation`, { cache: 'no-store' });
      const result = await response.json() as { recommendation?: RecommendationState | null; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not load the hospital recommendation.');
      const next = result.recommendation ?? null;
      setRecommendation(next);
      setError('');
      onDestination(next?.selectedHospitalLocation);
      if (next?.status === 'unserved' && nearby.length === 0) {
        const nearbyResponse = await fetch(`/api/sos/${encodeURIComponent(tripId)}/hospitals?limit=5`, { cache: 'no-store' });
        if (nearbyResponse.ok) {
          const nearbyResult = await nearbyResponse.json() as { hospitals?: NearbyHospital[]; unverifiedNearby?: NearbyHospital[] };
          setNearby([...(nearbyResult.hospitals ?? []), ...(nearbyResult.unverifiedNearby ?? [])]);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the hospital recommendation.');
    } finally { setLoading(false); }
  }, [tripId, onDestination, nearby.length]);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { setClockNow(Date.now()); if (document.visibilityState === 'visible') void refresh(); }, 3000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [refresh]);

  const submitCondition = async (nextConditionId: string) => {
    setConditionId(nextConditionId); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/condition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditionId: nextConditionId }) });
      const result = await response.json() as { recommendation?: RecommendationState; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not create a recommendation.');
      setRecommendation(result.recommendation ?? null); onDestination(result.recommendation?.selectedHospitalLocation);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create a recommendation.'); }
    finally { setBusy(false); }
  };

  const submitOverride = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/hospital-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hospitalId: overrideHospital, reason: overrideReason }) });
      const result = await response.json() as { recommendation?: RecommendationState; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not request the selected hospital.');
      setRecommendation(result.recommendation ?? null); onDestination(result.recommendation?.selectedHospitalLocation); setOverrideReason('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not request the selected hospital.'); }
    finally { setBusy(false); }
  };

  const canChooseCondition = ['arrived_patient', 'patient_on_board'].includes(tripStage);
  const secondsLeft = recommendation?.responseDeadline ? Math.max(0, Math.ceil((new Date(recommendation.responseDeadline).getTime() - clockNow) / 1000)) : null;
  if (loading) return <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3" aria-busy="true"><p className="text-sm text-slate-600">Loading hospital recommendation…</p></section>;
  return <section className="mt-4 rounded-xl border border-[#1E5A8E]/20 bg-white p-3 sm:p-4" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-bold text-[#1B1F23]">Hospital recommendation</h3><p className="mt-1 text-xs font-semibold text-[#1E5A8E]">Simulation / decision support</p></div></div>
    <p className="mt-2 text-xs text-slate-600">Synthetic data under declared assumptions. The driver chooses the destination; availability is not guaranteed.</p>
    {!recommendation && canChooseCondition && <div className="mt-3"><label htmlFor={`condition-${tripId}`} className="block text-sm font-semibold text-slate-800">Select patient condition</label><select id={`condition-${tripId}`} value={conditionId} onChange={(event) => { if (event.target.value) void submitCondition(event.target.value); }} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E5A8E]"><option value="">Choose from configured conditions…</option>{conditions.map((condition) => <option key={condition.id} value={condition.id}>{condition.label} · urgency {condition.urgency}</option>)}</select>{busy && <p className="mt-2 text-xs text-slate-600">Preparing recommendation and sending a bed request…</p>}</div>}
    {!recommendation && !canChooseCondition && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Condition selection opens when you arrive at the patient or pick them up.</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-[#C0362C]/30 bg-[#C0362C]/5 p-3 text-sm text-[#C0362C]">{error}<button type="button" onClick={() => void refresh()} className="ml-2 min-h-9 font-bold underline">Retry</button></p>}
    {recommendation && <>
      <div className="mt-3 rounded-lg border border-[#1E5A8E]/20 bg-[#F6F8F9] p-3"><p className="font-semibold text-slate-900">Condition · {recommendation.conditionLabel}</p><p className="mt-1 text-sm font-bold text-[#1E5A8E]">Recommended hospital (decision support): {recommendation.selectedHospitalName || 'No feasible hospital'}</p><p className={`mt-1 text-sm font-semibold ${recommendation.status === 'confirmed' ? 'text-[#2E7D4F]' : recommendation.status === 'unserved' ? 'text-[#C0362C]' : 'text-[#C98A1F]'}`}>{recommendation.status === 'requested' ? `Requesting a bed · ${secondsLeft ?? 0} seconds for response` : recommendation.status === 'confirmed' ? 'Accepted · bed reserved' : recommendation.status === 'unserved' ? `No hospital confirmed · ${recommendation.unservedReason?.replaceAll('_', ' ')}` : recommendation.status}</p>{recommendation.status === 'unserved' && <p className="mt-2 text-sm font-semibold text-[#C0362C]">{recommendation.fallbackText}</p>}</div>
      {recommendation.ranked.length > 0 && <div className="mt-3 space-y-2"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Feasible options and reasons</h4>{recommendation.ranked.map((item, index) => <article key={item.hospitalId} className="rounded-lg border border-slate-200 p-3"><p className="font-semibold text-slate-900">{index === 0 ? 'Recommended · ' : 'Alternative · '}{item.hospitalName}</p><p className="mt-1 text-xs text-slate-600">ETA {item.travelTimeMinutes} min · Bed availability at arrival {Math.round(item.p_available * 100)}% · Simulated acceptance likelihood {Math.round(item.p_accept * 100)}% · Simulated case experience {Math.round(item.experienceScore * 100)}%</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></article>)}</div>}
      {recommendation.ranked.length > 1 && recommendation.status !== 'confirmed' && recommendation.status !== 'unserved' && <form onSubmit={submitOverride} className="mt-3 rounded-lg border border-slate-200 p-3"><label htmlFor={`override-${tripId}`} className="block text-sm font-semibold text-slate-800">Choose a different hospital</label><select id={`override-${tripId}`} value={overrideHospital} onChange={(event) => setOverrideHospital(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Select a feasible option…</option>{recommendation.ranked.map((item) => <option key={item.hospitalId} value={item.hospitalId}>{item.hospitalName} · {item.travelTimeMinutes} min</option>)}</select><label htmlFor={`override-reason-${tripId}`} className="mt-2 block text-xs font-semibold text-slate-700">Reason for override</label><textarea id={`override-reason-${tripId}`} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-slate-300 p-2 text-sm" maxLength={240} /><button type="submit" disabled={busy || !overrideHospital || !overrideReason.trim()} className="mt-2 min-h-10 rounded-lg bg-[#1E5A8E] px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Request this hospital'}</button></form>}
      <div className="mt-3 rounded-lg border border-slate-200 p-3"><h4 className="text-sm font-semibold text-slate-800">Request timeline</h4>{recommendation.timeline.length ? <ol className="mt-2 space-y-2">{recommendation.timeline.map((event, index) => <li key={`${event.status}-${index}`} className="border-l-2 border-[#1E5A8E]/30 pl-3"><p className="text-xs font-semibold text-slate-800">{event.status.replaceAll('_', ' ')}{event.hospitalName ? ` · ${event.hospitalName}` : ''}</p><p className="text-xs text-slate-600">{event.reason} · {new Date(event.at).toLocaleTimeString()}</p></li>)}</ol> : <p className="mt-2 text-xs text-slate-500">No request events yet.</p>}</div>
      {recommendation.fallbackFlags.length > 0 && <p role="status" className="mt-2 text-xs text-[#C98A1F]">A scoring component was unavailable; current capacity and the nearest feasible option were used.</p>}
      {recommendation.status === 'unserved' && <div className="mt-3 rounded-lg border border-[#C0362C]/30 p-3"><h4 className="text-sm font-bold text-[#C0362C]">Nearest hospitals for a manual call</h4>{nearby.length ? <ul className="mt-2 space-y-2">{nearby.map((hospital) => <li key={hospital.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{hospital.name} · {hospital.travelTimeMinutes} min <span className="block text-xs text-slate-500">{hospital.label}</span></span><a href={hospital.directionsUrl} target="_blank" rel="noreferrer" className="min-h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#1E5A8E]">Directions</a></li>)}</ul> : <p className="mt-2 text-xs text-slate-600">Loading nearest registered hospitals…</p>}</div>}
    </>}
  </section>;
}
