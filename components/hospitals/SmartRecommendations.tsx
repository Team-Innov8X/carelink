'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { ArrowLeft, MapPin, User } from '@/components/icons';

type MatchResource = { id: string; type: string; category: string; totalQuantity: number; availableQuantity: number };
type MatchResult = {
  hospitalId: string; name: string; status: string; score: number; travelTimeMinutes: number | null;
  distanceKm: number; matchedResources: string[]; missingResources: string[];
  scoreBreakdown: { resourceMatch: number; travelTime: number; freshness: number; availability: number };
  scoreContributions: { resourceMatch: number; travelTime: number; freshness: number; availability: number; statusPenalty: number };
  resources: MatchResource[];
};
type PatientHold = { id: string; hospitalId: string; hospitalName: string; status: string; queuePosition?: number; expiresAt?: string; reason?: string; createdAt: string };
type MatchPriority = 'balanced' | 'resources' | 'travel' | 'freshness';
type AssistantMessage = { role: 'user' | 'assistant'; text: string };

const bedOptions = ['general', 'icu', 'trauma', 'pediatric', 'emergency', 'isolation', 'ventilator'];
const normalize = (value: string) => value.trim().toLowerCase().replace(/[ -]+/g, '_');
const aliases: Record<string, string[]> = { ventilators: ['ventilator'], ventilator: ['ventilators'], trauma_care: ['trauma'], general_care: ['general'], intensive_care: ['icu'], icu: ['intensive_care'] };
const categoryMatches = (selected: string, category: string) => {
  const wanted = normalize(selected); const actual = normalize(category);
  return actual === wanted || (aliases[wanted] ?? []).includes(actual) || (aliases[actual] ?? []).includes(wanted);
};

export const SmartRecommendations: React.FC = () => {
  const { emergencies, selectedEmergencyId, setSelectedEmergencyId, setActiveTab, role } = useCareLink();
  const currentEmergency = emergencies.find((item) => item.id === selectedEmergencyId) || emergencies[0];
  const [condition, setCondition] = useState(role === 'patient' ? '' : currentEmergency?.condition ?? '');
  const [requirements, setRequirements] = useState(role === 'patient' ? '' : currentEmergency?.requiredFacilities.join(', ') ?? '');
  const [preferredRequirements, setPreferredRequirements] = useState('');
  const [patientLatitude, setPatientLatitude] = useState('');
  const [patientLongitude, setPatientLongitude] = useState('');
  const [locationMessage, setLocationMessage] = useState('');
  const [bedCategory, setBedCategory] = useState('general');
  const [maxTravelMinutes, setMaxTravelMinutes] = useState(role === 'patient' ? '60' : String(currentEmergency?.etaLimitMin || 60));
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'distance' | 'eta'>('match');
  const [priority, setPriority] = useState<MatchPriority>('balanced');
  const [naturalSearch, setNaturalSearch] = useState('');
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState('');
  const [criteriaSource, setCriteriaSource] = useState<'grok' | 'groq' | 'fallback' | ''>('');
  const [explained, setExplained] = useState<string | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [activeWeights, setActiveWeights] = useState({ resourceMatch: 50, travelTime: 30, freshness: 20, availability: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchVersion, setSearchVersion] = useState(0);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [holds, setHolds] = useState<PatientHold[]>([]);
  const [holdsError, setHoldsError] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'patient') return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/holds/mine', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load your bed requests.');
        if (active) { setHolds(result.holds ?? []); setHoldsError(''); }
      } catch (cause) { if (active) setHoldsError(cause instanceof Error ? cause.message : 'Could not load your bed requests.'); }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [role]);

  const origin = role === 'patient'
    ? { latitude: Number(patientLatitude), longitude: Number(patientLongitude) }
    : currentEmergency ? { latitude: currentEmergency.location.lat, longitude: currentEmergency.location.lng } : null;
  const latitude = origin?.latitude ?? Number.NaN;
  const longitude = origin?.longitude ?? Number.NaN;
  const originValid = Boolean(origin && (role !== 'patient' || (patientLatitude.trim() !== '' && patientLongitude.trim() !== '')) && Number.isFinite(origin.latitude) && origin.latitude >= -90 && origin.latitude <= 90 && Number.isFinite(origin.longitude) && origin.longitude >= -180 && origin.longitude <= 180);
  const requestedResources = useMemo(() => requirements.split(',').map((value) => value.trim()).filter(Boolean), [requirements]);
  const requirementsKey = requestedResources.join('|');
  const preferredResourcesKey = preferredRequirements.split(',').map((value) => value.trim()).filter(Boolean).join('|');

  useEffect(() => {
    if (!originValid || !condition.trim()) {
      const invalidTimer = window.setTimeout(() => {
        setLoading(false); setResults([]);
        setError(role === 'patient' ? patientLatitude || patientLongitude ? 'Enter a valid latitude and longitude to search.' : 'Share your location or enter coordinates to find matching hospitals.' : 'Add a care requirement to search for hospitals.');
      }, 0);
      return () => window.clearTimeout(invalidTimer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch('/api/rank', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ emergencyType: condition.trim(), requiredResources: [...new Set([...requirementsKey.split('|').filter(Boolean), bedCategory])], preferredResources: preferredResourcesKey.split('|').filter(Boolean), ambulanceLocation: { latitude, longitude }, maxTravelMinutes: Number(maxTravelMinutes), bedCategory, priority, limit: 100 }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not find matching hospitals.');
        setResults(Array.isArray(result.ranked) ? result.ranked : []);
        if (result.rankingWeights) setActiveWeights(result.rankingWeights);
      } catch (cause) {
        if (!controller.signal.aborted) { setResults([]); setError(cause instanceof Error ? cause.message : 'Could not find matching hospitals.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, searchVersion ? 0 : 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [originValid, latitude, longitude, condition, requirementsKey, preferredResourcesKey, bedCategory, maxTravelMinutes, priority, searchVersion, role, patientLatitude, patientLongitude]);

  const filteredResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    return results.filter((result) => !query || result.name.toLowerCase().includes(query) || result.matchedResources.some((item) => item.toLowerCase().includes(query)))
      .sort((a, b) => sortBy === 'distance' ? a.distanceKm - b.distanceKm : sortBy === 'eta' ? (a.travelTimeMinutes ?? Infinity) - (b.travelTimeMinutes ?? Infinity) : b.score - a.score || a.distanceKm - b.distanceKm);
  }, [results, search, sortBy]);

  const getSelectedBed = (result: MatchResult) => result.resources.find((resource) => resource.type === 'bed' && Boolean(resource.id) && categoryMatches(bedCategory, resource.category));

  const searchNow = (event: FormEvent) => { event.preventDefault(); setSearchVersion((version) => version + 1); };

  const interpretSearch = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || assistantBusy) return;
    if (/\b(explain|why)\b/i.test(trimmed) && /\b(match|recommend|result|hospital|this)\b/i.test(trimmed) && results.length) {
      const named = results.find((item) => trimmed.toLowerCase().includes(item.name.toLowerCase()));
      const result = named ?? results[0];
      setExplained(result.hospitalId);
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: `${result.name}: ${matchExplanation(result)}` }]);
      return;
    }
    if (/\b(alternatives?|similar)\b/i.test(trimmed) && results.length) {
      setSortBy(/closer|nearest|faster|quick/i.test(trimmed) ? 'distance' : 'match');
      setSearch('');
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: `Showing the other hospitals returned by the live matching system, ranked by ${/closer|nearest|faster|quick/i.test(trimmed) ? 'distance' : 'the same requirements and compatibility factors'}.` }]);
      return;
    }
    setAssistantBusy(true); setAssistantError(''); setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }]);
    try {
      const response = await fetch('/api/rank/assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, current: { emergencyType: condition || 'hospital care', requiredResources: requestedResources, bedCategory, maxTravelMinutes: Number(maxTravelMinutes), priority } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not refine your search.');
      setCondition(body.criteria.emergencyType);
      setRequirements(body.criteria.requiredResources.join(', '));
      setBedCategory(body.criteria.bedCategory);
      setMaxTravelMinutes(String(body.criteria.maxTravelMinutes));
      setPriority(body.criteria.priority);
      setCriteriaSource(body.source);
      setSearchVersion((version) => version + 1);
      setAssistantMessages((current) => [...current, { role: 'assistant', text: `${body.reply}${body.source === 'fallback' ? ' (Using local search interpretation.)' : ''}` }]);
    } catch (cause) {
      setAssistantError(cause instanceof Error ? cause.message : 'Could not refine your search.');
      setAssistantMessages((current) => [...current, { role: 'assistant', text: 'I could not update those criteria. Your current results and preferences are unchanged.' }]);
    } finally { setAssistantBusy(false); }
  };

  const matchExplanation = (result: MatchResult) => {
    const resource = Math.round(result.scoreBreakdown.resourceMatch * 100);
    const travel = Math.round(result.scoreBreakdown.travelTime * 100);
    const freshness = Math.round(result.scoreBreakdown.freshness * 100);
    const matched = result.matchedResources.length ? `Available matching needs: ${result.matchedResources.join(', ')}.` : 'No requested specialties or equipment were found available in current inventory.';
    const missing = result.missingResources.length ? ` Missing or unavailable: ${result.missingResources.join(', ')}.` : ' All listed requirements matched.';
    const eta = result.travelTimeMinutes == null ? 'Travel time was unavailable.' : `Estimated travel is ${Math.ceil(result.travelTimeMinutes)} minutes (${result.distanceKm} km).`;
    const points = result.scoreContributions;
    return `${matched}${missing} ${eta} Factor values: resource fit ${resource}%, travel fit ${travel}%, data freshness ${freshness}%. Weighted score points: resources ${points.resourceMatch.toFixed(1)}, travel ${points.travelTime.toFixed(1)}, freshness ${points.freshness.toFixed(1)}, availability ${points.availability.toFixed(1)}; status deduction ${points.statusPenalty.toFixed(1)}. These deterministic criteria produce ${result.score.toFixed(2)}/100; this is not an AI prediction.`;
  };

  const useMyLocation = () => {
    setLocationMessage('');
    if (!navigator.geolocation) { setLocationMessage('This browser does not support location access. Enter coordinates instead.'); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPatientLatitude(String(coords.latitude)); setPatientLongitude(String(coords.longitude)); setLocationMessage('Location added. Finding matching hospitals…');
    }, () => setLocationMessage('Could not access your location. Allow location access or enter coordinates.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };

  const requestBed = async (result: MatchResult) => {
    const resource = getSelectedBed(result);
    if (!resource) { setRequestMessage(`No ${bedCategory} bed resource is listed for ${result.name}. Choose another bed type or hospital.`); return; }
    setRequesting(result.hospitalId); setRequestMessage('');
    try {
      const patientDetails = currentEmergency ? {
        name: currentEmergency.patientName,
        age: currentEmergency.age,
        gender: currentEmergency.gender,
        conditionSummary: condition.trim(),
        priority: currentEmergency.priority.toLowerCase() === 'critical' ? 'critical' as const : currentEmergency.priority.toLowerCase() === 'high' ? 'urgent' as const : 'standard' as const,
        etaMinutes: currentEmergency.etaLimitMin,
      } : undefined;
      const payload = role === 'patient'
        ? { hospitalId: result.hospitalId, resourceId: resource.id, notes: `Smart Match request: ${condition.trim()}` }
        : { hospitalId: result.hospitalId, resourceId: resource.id, resourceType: 'bed', category: resource.category, patientDetails, notes: `Smart Match for ${currentEmergency?.id ?? 'emergency'}: ${condition.trim()}` };
      const response = await fetch('/api/holds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || body.message || 'Could not request this bed.');
      setRequestMessage(body.status === 'queued' ? `Added to the queue at ${result.name}${body.queuePosition ? ` · queue position ${body.queuePosition}` : ''}.` : `Bed held at ${result.name} pending hospital confirmation${body.expiresAt ? ` until ${new Date(body.expiresAt).toLocaleTimeString()}` : ''}.`);
      if (role === 'patient') {
        const refreshed = await fetch('/api/holds/mine', { cache: 'no-store' }).then((item) => item.json());
        if (Array.isArray(refreshed.holds)) setHolds(refreshed.holds);
      }
    } catch (cause) { setRequestMessage(cause instanceof Error ? cause.message : 'Could not request this bed.'); }
    finally { setRequesting(null); }
  };

  const cancelHold = async (hold: PatientHold) => {
    setCancelling(hold.id); setHoldsError('');
    try {
      const response = await fetch(`/api/holds/${encodeURIComponent(hold.id)}/cancel`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'cancelled' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not cancel this request.');
      setHolds((current) => current.map((item) => item.id === hold.id ? { ...item, status: 'cancelled' } : item));
    } catch (cause) { setHoldsError(cause instanceof Error ? cause.message : 'Could not cancel this request.'); }
    finally { setCancelling(null); }
  };

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => setActiveTab('dashboard')} className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to Dashboard</button>
      {role !== 'patient' && emergencies.length > 0 && <label className="flex items-center gap-2 text-xs text-slate-500">Switch case<select value={currentEmergency?.id ?? ''} onChange={(event) => { const selected = emergencies.find((item) => item.id === event.target.value); setSelectedEmergencyId(event.target.value); setCondition(selected?.condition ?? ''); setRequirements(selected?.requiredFacilities.join(', ') ?? ''); setMaxTravelMinutes(String(selected?.etaLimitMin || 60)); }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-800">{emergencies.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.condition}</option>)}</select></label>}
    </div>

    <header><h1 className="text-2xl font-bold tracking-tight text-slate-900">{role === 'patient' ? 'Find a matching hospital' : 'Recommended Hospitals for Patient'}</h1><p className="mt-1 text-sm text-slate-500">Live matches ranked from hospital resources, staff availability, travel time, and data freshness.</p></header>

    <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
      <div><h2 className="font-bold text-slate-900">Describe the care you need</h2><p className="mt-1 text-xs text-slate-600">AI can translate a plain-language search into filters. Hospital selection and scores remain based on live records and deterministic matching.</p></div>
      <form onSubmit={(event) => { event.preventDefault(); void interpretSearch(naturalSearch); setNaturalSearch(''); }} className="flex flex-col gap-2 sm:flex-row"><input value={naturalSearch} onChange={(event) => setNaturalSearch(event.target.value)} maxLength={1000} placeholder="e.g. Find cardiac care with ICU within 20 minutes; prioritize the closest hospital" className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><button type="submit" disabled={assistantBusy || !naturalSearch.trim()} className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{assistantBusy ? 'Interpreting…' : 'Apply search'}</button></form>
      <details className="rounded-xl border border-sky-100 bg-white p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Refine with the matching assistant</summary><div className="mt-3 space-y-2">{assistantMessages.map((item, index) => <p key={`${item.role}-${index}`} className={`rounded-lg p-2.5 text-xs ${item.role === 'user' ? 'ml-5 bg-slate-100 text-slate-700' : 'mr-5 bg-sky-50 text-slate-700'}`}><b>{item.role === 'user' ? 'You' : 'Assistant'}:</b> {item.text}</p>)}<form onSubmit={(event) => { event.preventDefault(); void interpretSearch(assistantInput); setAssistantInput(''); }} className="flex gap-2"><input value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} maxLength={1000} placeholder="Prioritize resources, find closer alternatives, or explain a result" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button type="submit" disabled={assistantBusy || !assistantInput.trim()} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Send</button></form>{assistantError && <p role="alert" className="text-xs text-rose-700">{assistantError}</p>}</div></details>
      {criteriaSource && <p className="text-[11px] text-slate-500">Criteria interpreted by {criteriaSource === 'groq' ? 'the configured Groq provider' : criteriaSource === 'grok' ? 'the configured xAI Grok provider' : 'the local fallback'}; results are ranked by the existing matching engine.</p>}
    </section>

    {role === 'patient' ? <form onSubmit={searchNow} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold text-slate-900">Your care requirements</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">Condition or care needed<input required maxLength={100} value={condition} onChange={(event) => setCondition(event.target.value)} placeholder="e.g. chest pain, respiratory support" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Required facilities<input value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="Cardiac, ICU" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Preferred facilities (optional)<input value={preferredRequirements} onChange={(event) => setPreferredRequirements(event.target.value)} placeholder="Extra equipment, specialties" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Latitude<input type="number" step="any" min="-90" max="90" value={patientLatitude} onChange={(event) => setPatientLatitude(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Longitude<input type="number" step="any" min="-180" max="180" value={patientLongitude} onChange={(event) => setPatientLongitude(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
      </div>
      {locationMessage && <p role="status" className="text-xs text-sky-800">{locationMessage}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" onClick={useMyLocation} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><MapPin className="mr-1 inline h-3.5 w-3.5" />Use my location</button><button type="submit" className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white">Find hospitals</button></div>
    </form> : currentEmergency ? <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2"><div className="flex items-start gap-3"><User className="mt-1 h-5 w-5 text-sky-700" /><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Case {currentEmergency.id} · {currentEmergency.priority} priority</p><p className="mt-1 font-bold text-slate-900">{currentEmergency.condition}</p><p className="mt-1 text-xs text-slate-500">{currentEmergency.location.address}</p></div></div><label className="text-xs font-semibold text-slate-600">Required facilities<input value={requirements} onChange={(event) => setRequirements(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Preferred facilities (optional)<input value={preferredRequirements} onChange={(event) => setPreferredRequirements(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label></section> : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No emergency case is available to match.</p>}

    {role === 'patient' && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-900">Your bed requests</h2>{holdsError && <p role="alert" className="mt-2 text-sm text-rose-700">{holdsError}</p>}{holds.length ? <div className="mt-3 space-y-2">{holds.map((hold) => <div key={hold.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-sm font-semibold text-slate-900">{hold.hospitalName}</p><p className="mt-1 text-xs capitalize text-slate-600">{hold.status}{hold.status === 'queued' && hold.queuePosition ? ` · queue position ${hold.queuePosition}` : ''}{hold.status === 'pending' && hold.expiresAt ? ` · expires ${new Date(hold.expiresAt).toLocaleTimeString()}` : ''}{hold.reason ? ` · ${hold.reason.replaceAll('_', ' ')}` : ''}</p></div>{['queued', 'pending'].includes(hold.status) && <button type="button" disabled={cancelling === hold.id} onClick={() => void cancelHold(hold)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">{cancelling === hold.id ? 'Cancelling…' : 'Cancel request'}</button>}</div>)}</div> : <p className="mt-2 text-sm text-slate-500">No hospital bed requests yet.</p>}</section>}

    {requestMessage && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{requestMessage}</p>}
    <form onSubmit={searchNow} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <label className="min-w-44 flex-1 text-xs font-semibold text-slate-700">Search hospitals or matched resources<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hospital, ICU, cardiac…" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
      <label className="text-xs font-semibold text-slate-700">Bed category<select value={bedCategory} onChange={(event) => setBedCategory(event.target.value)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{bedOptions.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700">Max travel<select value={maxTravelMinutes} onChange={(event) => setMaxTravelMinutes(event.target.value)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{!['15', '30', '60', '120'].includes(maxTravelMinutes) && <option value={maxTravelMinutes}>{maxTravelMinutes} min · case target</option>}<option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option><option value="120">Any (120 min)</option></select></label>
      <label className="text-xs font-semibold text-slate-700">Sort<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="match">Best match</option><option value="eta">Fastest ETA</option><option value="distance">Closest</option></select></label>
      <label className="text-xs font-semibold text-slate-700">Ranking preference<select value={priority} onChange={(event) => setPriority(event.target.value as MatchPriority)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="balanced">Balanced</option><option value="resources">Best resources</option><option value="travel">Closest / fastest</option><option value="freshness">Freshest data</option></select></label>
      <button type="submit" className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white">Refresh matches</button>
    </form>
    <p className="text-xs text-slate-500">Effective score weights: resources {activeWeights.resourceMatch}% · travel {activeWeights.travelTime}% · freshness {activeWeights.freshness}% · availability {activeWeights.availability}%. Required resources and the selected travel limit are eligibility rules; preferred facilities affect resource fit.</p>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {loading && <div role="status" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"><span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-700 border-t-transparent align-[-3px]" />Finding hospitals from live inventory…</div>}
    {!loading && !error && originValid && filteredResults.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{results.length ? 'No hospitals match this search.' : 'No eligible hospitals matched these requirements. Try a wider travel limit or fewer required facilities.'}</p>}
    {!loading && filteredResults.length > 0 && <><h2 className="text-lg font-bold text-slate-900">Top Matches <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{filteredResults.length}</span></h2><div className="space-y-4">{filteredResults.map((result, index) => {
      const resource = getSelectedBed(result); const available = resource?.availableQuantity ?? 0;
      const activeHold = role === 'patient' ? holds.find((hold) => hold.hospitalId === result.hospitalId && ['queued', 'pending', 'confirmed'].includes(hold.status)) : undefined;
      return <article key={result.hospitalId} className={`rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md ${index === 0 ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-700 text-sm font-black text-white">{index + 1}</span><h3 className="text-base font-bold text-slate-900">{result.name}</h3><span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">{Math.round(result.score)}% match</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{result.status}</span></div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">{result.matchedResources.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">Matches {item.replaceAll('_', ' ')}</span>)}{result.missingResources.map((item) => <span key={item} className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">No live match for {item.replaceAll('_', ' ')}</span>)}</div>
          <p className="mt-2 text-xs text-slate-600">{result.matchedResources.length ? `Live inventory has ${result.matchedResources.map((item) => item.replaceAll('_', ' ')).join(', ')} available.` : 'No requested specialty or equipment is currently available in inventory.'} Travel estimate {result.travelTimeMinutes == null ? 'unavailable' : `~${Math.ceil(result.travelTimeMinutes)} min`} · {result.distanceKm} km.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4"><span>Resource fit <b>{Math.round(result.scoreBreakdown.resourceMatch * 100)}%</b></span><span>Travel <b>{result.travelTimeMinutes == null ? '—' : `${Math.ceil(result.travelTimeMinutes)} min`}</b></span><span>Freshness <b>{Math.round(result.scoreBreakdown.freshness * 100)}%</b></span><span>{bedCategory} beds <b>{available} available</b></span></div>
        </div><div className="flex shrink-0 flex-col gap-2 sm:items-end"><button type="button" onClick={() => void requestBed(result)} disabled={requesting === result.hospitalId || !resource || Boolean(activeHold)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{requesting === result.hospitalId ? 'Sending…' : activeHold?.status === 'pending' ? 'Request pending' : activeHold?.status === 'queued' ? 'In queue' : activeHold?.status === 'confirmed' ? 'Confirmed' : resource ? `Request ${bedCategory} bed` : `No ${bedCategory} bed record`}</button><button type="button" onClick={() => setExplained((current) => current === result.hospitalId ? null : result.hospitalId)} className="text-xs font-semibold text-sky-800 hover:underline">{explained === result.hospitalId ? 'Hide explanation' : 'Why this match?'}</button>{activeHold?.status === 'queued' && activeHold.queuePosition && <span className="max-w-44 text-right text-[11px] text-slate-600">Queue position {activeHold.queuePosition}</span>}{resource && available === 0 && !activeHold && <span className="max-w-44 text-right text-[11px] text-amber-800">A request can still join the queue.</span>}</div></div>
        {explained === result.hospitalId && <p className="mt-4 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-950">{matchExplanation(result)}</p>}
      </article>;
    })}</div></>}
  </div>;
};
