'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { ArrowLeft, Building2, MapPin, Pill, Phone, User } from '@/components/icons';
import { buildMatchExplanation } from '@/lib/smart-match-explanation';

type MatchResource = { id: string; type: string; category: string; totalQuantity: number; availableQuantity: number; updatedAt?: string | null };
type MatchResult = {
  hospitalId: string; name: string; status: string; score: number; travelTimeMinutes: number | null;
  distanceKm: number; matchedResources: string[]; missingResources: string[];
  scoreBreakdown: { resourceMatch: number; travelTime: number; freshness: number; availability: number };
  scoreContributions: { resourceMatch: number; travelTime: number; freshness: number; availability: number; statusPenalty: number };
  resources: MatchResource[]; availabilityUpdatedAt?: string | null; isDemo?: boolean;
};
type PatientHold = { id: string; hospitalId: string; hospitalName: string; status: string; queuePosition?: number; expiresAt?: string; reason?: string; createdAt: string };
type MatchPriority = 'balanced' | 'resources' | 'travel' | 'freshness';
type AssistantMessage = { role: 'user' | 'assistant'; text: string };
type PharmacyMatch = { pharmacyId: string; isDemo: boolean; pharmacyName: string; address: string; phone?: string; medicineId: string; medicineName: string; formulation: string; requestedQuantity: number; availableQuantity: number | null; availability: 'verified_available' | 'verified_unavailable' | 'unverified'; eligibleForRequest: boolean; stockUpdatedAt: string | null; distanceKm: number | null; score: number; scoreBreakdown: { medicineIdentity: number; verifiedStock: number; distance: number }; scoreContributions: { medicine: number; stock: number; distance: number }; explanation: string };
type ActivePatientRequest = { id: string; status: string; incidentType: string; location?: { latitude: number; longitude: number }; requiredEquipment?: string[] };

const bedOptions = ['general', 'icu', 'trauma', 'pediatric', 'emergency', 'isolation', 'ventilator'];
const normalize = (value: string) => value.trim().toLowerCase().replace(/[ -]+/g, '_');
const aliases: Record<string, string[]> = { ventilators: ['ventilator'], ventilator: ['ventilators'], trauma_care: ['trauma'], general_care: ['general'], intensive_care: ['icu'], icu: ['intensive_care'] };
const categoryMatches = (selected: string, category: string) => {
  const wanted = normalize(selected); const actual = normalize(category);
  return actual === wanted || (aliases[wanted] ?? []).includes(actual) || (aliases[actual] ?? []).includes(wanted);
};

export const SmartRecommendations: React.FC = () => {
  const { emergencies, selectedEmergencyId, setSelectedEmergencyId, setActiveTab, setSelectedHospitalId, role } = useCareLink();
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
  const [criteriaSource, setCriteriaSource] = useState<'gemini' | 'fallback' | ''>('');
  const [explained, setExplained] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [explanationLoading, setExplanationLoading] = useState<string | null>(null);
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
  const [resourceType, setResourceType] = useState<'hospital' | 'pharmacy'>('hospital');
  const [medicineQuery, setMedicineQuery] = useState('');
  const [medicineQuantity, setMedicineQuantity] = useState(1);
  const [searchRadiusKm, setSearchRadiusKm] = useState(25);
  const [pharmacyResults, setPharmacyResults] = useState<PharmacyMatch[]>([]);
  const [pharmacyWeights, setPharmacyWeights] = useState({ medicine: 45, stock: 40, distance: 15 });
  const [pharmacySort, setPharmacySort] = useState<'match' | 'distance'>('match');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'verified_available' | 'verified_unavailable' | 'unverified'>('all');
  const [pharmacyMinimumScore, setPharmacyMinimumScore] = useState(0);
  const [hospitalStatusFilter, setHospitalStatusFilter] = useState<'all' | 'active' | 'busy'>('all');
  const [minimumScore, setMinimumScore] = useState(0);
  const [orderStatus, setOrderStatus] = useState('');
  const [ordering, setOrdering] = useState<string | null>(null);
  const [activePatientRequest, setActivePatientRequest] = useState<ActivePatientRequest | null>(null);

  useEffect(() => {
    if (role !== 'patient') return;
    let active = true;
    void fetch('/api/sos', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load the active emergency request.');
      const request = (Array.isArray(body.requests) ? body.requests : []).find((item: ActivePatientRequest) => item.location && ['searching', 'accepted'].includes(item.status));
      if (active && request) {
        setActivePatientRequest(request);
        setCondition((value) => value || request.incidentType || '');
        setRequirements((value) => value || request.requiredEquipment?.join(', ') || '');
        setPatientLatitude((value) => value || String(request.location!.latitude));
        setPatientLongitude((value) => value || String(request.location!.longitude));
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [role]);

  useEffect(() => {
    if (role !== 'patient' || resourceType !== 'hospital') return;
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
  }, [role, resourceType]);

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
    if (resourceType !== 'hospital') return;
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
  }, [originValid, latitude, longitude, condition, requirementsKey, preferredResourcesKey, bedCategory, maxTravelMinutes, priority, searchVersion, role, patientLatitude, patientLongitude, resourceType]);

  useEffect(() => {
    if (resourceType !== 'pharmacy') return;
    if (!originValid || !medicineQuery.trim()) {
      const timer = window.setTimeout(() => {
        setLoading(false); setPharmacyResults([]);
        setError(!originValid ? 'Share your location or select an emergency case to search nearby pharmacies.' : 'Enter the medicine name to check pharmacy stock.');
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch('/api/pharmacy/matches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ medicine: medicineQuery.trim(), quantity: medicineQuantity, origin: { latitude, longitude }, radiusKm: searchRadiusKm, limit: 100 }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not check pharmacy inventory.');
        setPharmacyResults(Array.isArray(result.ranked) ? result.ranked : []);
        if (result.scoring) setPharmacyWeights(result.scoring);
      } catch (cause) {
        if (!controller.signal.aborted) { setPharmacyResults([]); setError(cause instanceof Error ? cause.message : 'Could not check pharmacy inventory.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [resourceType, originValid, latitude, longitude, medicineQuery, medicineQuantity, searchRadiusKm, searchVersion]);

  const filteredResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    return results.filter((result) => (!query || result.name.toLowerCase().includes(query) || result.matchedResources.some((item) => item.toLowerCase().includes(query)))
      && (hospitalStatusFilter === 'all' || result.status === hospitalStatusFilter) && result.score >= minimumScore)
      .sort((a, b) => sortBy === 'distance' ? a.distanceKm - b.distanceKm : sortBy === 'eta' ? (a.travelTimeMinutes ?? Infinity) - (b.travelTimeMinutes ?? Infinity) : b.score - a.score || a.distanceKm - b.distanceKm);
  }, [results, search, sortBy, hospitalStatusFilter, minimumScore]);
  const filteredPharmacies = useMemo(() => pharmacyResults.filter((item) => (availabilityFilter === 'all' || item.availability === availabilityFilter) && item.score >= pharmacyMinimumScore)
    .sort((a, b) => pharmacySort === 'distance' ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : Number(b.availability === 'verified_available') - Number(a.availability === 'verified_available') || b.score - a.score || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)), [pharmacyResults, pharmacySort, availabilityFilter, pharmacyMinimumScore]);

  const getSelectedBed = (result: MatchResult) => result.resources.find((resource) => resource.type === 'bed' && Boolean(resource.id) && categoryMatches(bedCategory, resource.category));

  const loadMatchExplanation = async (kind: 'hospital' | 'pharmacy', candidateId: string) => {
    const key = `${kind}:${candidateId}`;
    setExplained((current) => current === key ? null : key);
    if (aiExplanations[key] || explanationLoading) return;
    setExplanationLoading(key);
    try {
      const criteria = kind === 'hospital'
        ? { emergencyType: condition.trim(), requiredResources: [...new Set([...requestedResources, bedCategory])], preferredResources: preferredRequirements.split(',').map((value) => value.trim()).filter(Boolean), ambulanceLocation: { latitude, longitude }, maxTravelMinutes: Number(maxTravelMinutes), bedCategory, priority, limit: 100 }
        : { medicine: medicineQuery.trim(), quantity: medicineQuantity, origin: { latitude, longitude }, radiusKm: searchRadiusKm, limit: 100 };
      const response = await fetch('/api/rank/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, candidateId, criteria }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not explain this match.');
      setAiExplanations((current) => ({ ...current, [key]: body.explanation }));
    } catch (cause) {
      setAiExplanations((current) => ({ ...current, [key]: cause instanceof Error ? cause.message : 'Could not explain this match.' }));
    } finally { setExplanationLoading(null); }
  };

  const searchNow = (event: FormEvent) => { event.preventDefault(); setSearchVersion((version) => version + 1); };

  const interpretSearch = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || assistantBusy) return;
    if (resourceType === 'pharmacy' && /\b(explain|why)\b/i.test(trimmed) && pharmacyResults.length) {
      const named = pharmacyResults.find((item) => trimmed.toLowerCase().includes(item.pharmacyName.toLowerCase()));
      const match = named ?? pharmacyResults[0];
      void loadMatchExplanation('pharmacy', match.pharmacyId);
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: `${match.pharmacyName}: ${match.explanation} Score ${match.score}/100; current stock eligibility is ${match.eligibleForRequest ? 'verified' : 'not verified as available'}.` }]);
      return;
    }
    if (resourceType === 'pharmacy' && /\b(alternatives?|similar)\b/i.test(trimmed) && pharmacyResults.length) {
      setPharmacySort(/closer|nearest|faster|quick/i.test(trimmed) ? 'distance' : 'match');
      setAvailabilityFilter('all');
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: `Showing other pharmacy records sorted by ${/closer|nearest|faster|quick/i.test(trimmed) ? 'distance' : 'verified stock and match score'}.` }]);
      return;
    }
    if (/\b(explain|why)\b/i.test(trimmed) && /\b(match|recommend|result|hospital|this)\b/i.test(trimmed) && results.length) {
      const named = results.find((item) => trimmed.toLowerCase().includes(item.name.toLowerCase()));
      const result = named ?? results[0];
      void loadMatchExplanation('hospital', result.hospitalId);
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: `${result.name}: ${buildMatchExplanation(result)}` }]);
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
        body: JSON.stringify({ message: trimmed, current: { emergencyType: condition || 'hospital care', requiredResources: requestedResources, preferredResources: preferredRequirements.split(',').map((value) => value.trim()).filter(Boolean), bedCategory, maxTravelMinutes: Number(maxTravelMinutes), priority, resourceType, medicine: medicineQuery, quantity: medicineQuantity } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not refine your search.');
      setCondition(body.criteria.emergencyType);
      setRequirements(body.criteria.requiredResources.join(', '));
      setPreferredRequirements(body.criteria.preferredResources.join(', '));
      setBedCategory(body.criteria.bedCategory);
      setMaxTravelMinutes(String(body.criteria.maxTravelMinutes));
      setPriority(body.criteria.priority);
      setResourceType(body.criteria.resourceType ?? resourceType);
      if (body.criteria.medicine) setMedicineQuery(body.criteria.medicine);
      if (body.criteria.quantity) setMedicineQuantity(body.criteria.quantity);
      setCriteriaSource(body.source);
      setSearchVersion((version) => version + 1);
      setAssistantMessages((current) => [...current, { role: 'assistant', text: `${body.reply}${body.configurationWarning ? ` ${body.configurationWarning}` : body.aiWarning ? ` ${body.aiWarning}` : ''}` }]);
    } catch (cause) {
      setAssistantError(cause instanceof Error ? cause.message : 'Could not refine your search.');
      setAssistantMessages((current) => [...current, { role: 'assistant', text: 'I could not update those criteria. Your current results and preferences are unchanged.' }]);
    } finally { setAssistantBusy(false); }
  };

  const useMyLocation = () => {
    setLocationMessage('');
    if (!navigator.geolocation) { setLocationMessage('This browser does not support location access. Enter coordinates instead.'); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPatientLatitude(String(coords.latitude)); setPatientLongitude(String(coords.longitude)); setLocationMessage('Location added. Finding matching hospitals…');
    }, () => setLocationMessage('Could not access your location. Allow location access or enter coordinates.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };

  const orderMedicine = async (match: PharmacyMatch) => {
    if (match.availability !== 'verified_available') return;
    setOrdering(match.pharmacyId); setOrderStatus('');
    try {
      const response = await fetch('/api/pharmacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'order', medicineId: match.medicineId, pharmacyId: match.pharmacyId, quantity: match.requestedQuantity, isUrgent: true }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not request this medicine.');
      setOrderStatus(`Order ${body.order?.id ?? ''} sent to ${match.pharmacyName}. The requested quantity was rechecked and reserved from current stock; pharmacy confirmation is still pending.`);
      setSearchVersion((version) => version + 1);
    } catch (cause) { setOrderStatus(cause instanceof Error ? cause.message : 'Could not request this medicine.'); }
    finally { setOrdering(null); }
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

    <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-800">Care coordination</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">AI Smart Match</h1><p className="mt-1 text-sm text-slate-500">Find suitable healthcare resources for an emergency using current registered records.</p></div><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${loading ? 'animate-pulse bg-amber-500' : error ? 'bg-rose-500' : 'bg-emerald-500'}`} /><span className="text-xs font-semibold text-slate-600">{loading ? 'Checking records' : error ? 'Search needs attention' : 'Database search ready'}</span></div></header>

    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3"><div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Resource type">{(['hospital', 'pharmacy'] as const).map((type) => <button key={type} type="button" aria-pressed={resourceType === type} onClick={() => { setResourceType(type); setError(''); setOrderStatus(''); }} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${resourceType === type ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{type === 'hospital' ? <Building2 className="h-4 w-4" /> : <Pill className="h-4 w-4" />}{type === 'hospital' ? 'Hospitals' : 'Pharmacies'}</button>)}</div><p className="text-xs text-slate-500">{resourceType === 'hospital' ? 'Capacity and staff records are checked when you search.' : 'Only recent pharmacy-specific stock updates count as verified.'}</p></section>

    <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
      <div><h2 className="font-bold text-slate-900">Describe the resources you need</h2><p className="mt-1 text-xs text-slate-600">AI translates your request into filters. Availability and scores are based on database records and the matching rules shown with results.</p></div>
      <form onSubmit={(event) => { event.preventDefault(); void interpretSearch(naturalSearch); setNaturalSearch(''); }} className="flex flex-col gap-2 sm:flex-row"><input value={naturalSearch} onChange={(event) => setNaturalSearch(event.target.value)} maxLength={1000} placeholder="Describe the healthcare resources you need…" className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><button type="submit" disabled={assistantBusy || !naturalSearch.trim()} className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{assistantBusy ? 'Interpreting…' : 'Apply search'}</button></form>
      <details className="rounded-xl border border-sky-100 bg-white p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Refine with the matching assistant</summary><div className="mt-3 space-y-2">{assistantMessages.map((item, index) => <p key={`${item.role}-${index}`} className={`rounded-lg p-2.5 text-xs ${item.role === 'user' ? 'ml-5 bg-slate-100 text-slate-700' : 'mr-5 bg-sky-50 text-slate-700'}`}><b>{item.role === 'user' ? 'You' : 'Assistant'}:</b> {item.text}</p>)}<form onSubmit={(event) => { event.preventDefault(); void interpretSearch(assistantInput); setAssistantInput(''); }} className="flex gap-2"><input value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} maxLength={1000} placeholder="Prioritize resources, find closer alternatives, or explain a result" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button type="submit" disabled={assistantBusy || !assistantInput.trim()} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Send</button></form>{assistantError && <p role="alert" className="text-xs text-rose-700">{assistantError}</p>}</div></details>
      {criteriaSource && <p className="text-[11px] text-slate-500">Criteria interpreted by {criteriaSource === 'gemini' ? 'Gemini' : 'the local fallback'}; results and mandatory eligibility are determined by the existing matching engine.</p>}
    </section>

    {resourceType === 'pharmacy' ? <form onSubmit={(event) => { event.preventDefault(); setSearchVersion((version) => version + 1); }} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div><h2 className="font-bold text-slate-900">Medicine availability search</h2><p className="mt-1 text-xs text-slate-500">Search by the medicine name in pharmacy stock records. A result is verified only when a pharmacy recorded a stock update in the last six hours.</p></div>
      {role === 'patient' && activePatientRequest && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Using your active emergency request {activePatientRequest.id} · {activePatientRequest.incidentType} · {activePatientRequest.status}. Location is taken from that request.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-semibold text-slate-600 sm:col-span-2">Medicine name<input required maxLength={160} value={medicineQuery} onChange={(event) => setMedicineQuery(event.target.value)} placeholder="e.g. Salbutamol Inhaler 100mcg" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Quantity needed<input type="number" min={1} max={1000} step={1} value={medicineQuantity} onChange={(event) => setMedicineQuantity(Math.min(1000, Math.max(1, Number(event.target.value) || 1)))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Search radius<select value={searchRadiusKm} onChange={(event) => setSearchRadiusKm(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value={5}>Within 5 km</option><option value={10}>Within 10 km</option><option value={25}>Within 25 km</option><option value={50}>Within 50 km</option></select></label></div>
      {role === 'patient' && <div className="space-y-2"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Latitude<input type="number" step="any" min="-90" max="90" value={patientLatitude} onChange={(event) => setPatientLatitude(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Longitude<input type="number" step="any" min="-180" max="180" value={patientLongitude} onChange={(event) => setPatientLongitude(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label></div><button type="button" onClick={useMyLocation} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><MapPin className="mr-1 inline h-3.5 w-3.5" />Use my location</button></div>}
      {role !== 'patient' && currentEmergency && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Using incident location for case {currentEmergency.id}: {currentEmergency.location.address}</p>}
      {locationMessage && <p role="status" className="text-xs text-sky-800">{locationMessage}</p>}
      <div className="flex flex-wrap items-center gap-3"><button type="submit" className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white">Find Smart Matches</button><span className="text-xs text-slate-500">Medicine stock is rechecked when you send an order.</span></div>
    </form> : role === 'patient' ? <form onSubmit={searchNow} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div><h2 className="font-bold text-slate-900">Your care requirements</h2>{activePatientRequest && <p className="mt-1 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Using active request {activePatientRequest.id} · {activePatientRequest.incidentType} · {activePatientRequest.status}. You can adjust the matching criteria below.</p>}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">Condition or care needed<input required maxLength={100} value={condition} onChange={(event) => setCondition(event.target.value)} placeholder="e.g. chest pain, respiratory support" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Required facilities<input value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="Cardiac, ICU" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Preferred facilities (optional)<input value={preferredRequirements} onChange={(event) => setPreferredRequirements(event.target.value)} placeholder="Extra equipment, specialties" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Latitude<input type="number" step="any" min="-90" max="90" value={patientLatitude} onChange={(event) => setPatientLatitude(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Longitude<input type="number" step="any" min="-180" max="180" value={patientLongitude} onChange={(event) => setPatientLongitude(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
      </div>
      {locationMessage && <p role="status" className="text-xs text-sky-800">{locationMessage}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" onClick={useMyLocation} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><MapPin className="mr-1 inline h-3.5 w-3.5" />Use my location</button><button type="submit" className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white">Find Smart Matches</button></div>
    </form> : currentEmergency ? <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2"><div className="flex items-start gap-3"><User className="mt-1 h-5 w-5 text-sky-700" /><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Case {currentEmergency.id} · {currentEmergency.priority} priority</p><p className="mt-1 font-bold text-slate-900">{currentEmergency.condition}</p><p className="mt-1 text-xs text-slate-500">{currentEmergency.location.address}</p></div></div><label className="text-xs font-semibold text-slate-600">Required facilities<input value={requirements} onChange={(event) => setRequirements(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Preferred facilities (optional)<input value={preferredRequirements} onChange={(event) => setPreferredRequirements(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label></section> : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No emergency case is available to match.</p>}

    {resourceType === 'hospital' && role === 'patient' && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-900">Your bed requests</h2>{holdsError && <p role="alert" className="mt-2 text-sm text-rose-700">{holdsError}</p>}{holds.length ? <div className="mt-3 space-y-2">{holds.map((hold) => <div key={hold.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-sm font-semibold text-slate-900">{hold.hospitalName}</p><p className="mt-1 text-xs capitalize text-slate-600">{hold.status}{hold.status === 'queued' && hold.queuePosition ? ` · queue position ${hold.queuePosition}` : ''}{hold.status === 'pending' && hold.expiresAt ? ` · expires ${new Date(hold.expiresAt).toLocaleTimeString()}` : ''}{hold.reason ? ` · ${hold.reason.replaceAll('_', ' ')}` : ''}</p></div>{['queued', 'pending'].includes(hold.status) && <button type="button" disabled={cancelling === hold.id} onClick={() => void cancelHold(hold)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">{cancelling === hold.id ? 'Cancelling…' : 'Cancel request'}</button>}</div>)}</div> : <p className="mt-2 text-sm text-slate-500">No hospital bed requests yet.</p>}</section>}

    {resourceType === 'hospital' && requestMessage && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{requestMessage}</p>}
    {resourceType === 'pharmacy' && orderStatus && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{orderStatus}</p>}
    {resourceType === 'hospital' && <form onSubmit={searchNow} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <label className="min-w-44 flex-1 text-xs font-semibold text-slate-700">Search hospitals or matched resources<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hospital, ICU, cardiac…" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
      <label className="text-xs font-semibold text-slate-700">Availability<select value={hospitalStatusFilter} onChange={(event) => setHospitalStatusFilter(event.target.value as typeof hospitalStatusFilter)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="all">Active and busy</option><option value="active">Active</option><option value="busy">Busy</option></select></label>
      <label className="text-xs font-semibold text-slate-700">Minimum match<select value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value={0}>Any score</option><option value={50}>50%+</option><option value={70}>70%+</option><option value={85}>85%+</option></select></label>
      <label className="text-xs font-semibold text-slate-700">Bed category<select value={bedCategory} onChange={(event) => setBedCategory(event.target.value)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{bedOptions.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700">Max travel<select value={maxTravelMinutes} onChange={(event) => setMaxTravelMinutes(event.target.value)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{!['15', '30', '60', '120'].includes(maxTravelMinutes) && <option value={maxTravelMinutes}>{maxTravelMinutes} min · case target</option>}<option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option><option value="120">Any (120 min)</option></select></label>
      <label className="text-xs font-semibold text-slate-700">Sort<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="match">Best match</option><option value="eta">Fastest ETA</option><option value="distance">Closest</option></select></label>
      <label className="text-xs font-semibold text-slate-700">Ranking preference<select value={priority} onChange={(event) => setPriority(event.target.value as MatchPriority)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="balanced">Balanced</option><option value="resources">Best resources</option><option value="travel">Closest / fastest</option><option value="freshness">Freshest data</option></select></label>
      <button type="submit" className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white">Refresh matches</button>
    </form>}
    {resourceType === 'hospital' && <p className="text-xs text-slate-500">Effective score weights: resources {activeWeights.resourceMatch}% · travel {activeWeights.travelTime}% · freshness {activeWeights.freshness}% · availability {activeWeights.availability}%. Required resources and the selected travel limit are eligibility rules; preferred facilities affect resource fit.</p>}

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={() => setSearchVersion((version) => version + 1)} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-800">Retry search</button></div>}
    {loading && <div role="status" aria-live="polite" className="space-y-3"><p className="sr-only">{resourceType === 'hospital' ? 'Checking hospital resources and capacity' : 'Checking pharmacy stock records'}</p>{[0, 1].map((item) => <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><div className="carelink-skeleton h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><div className="carelink-skeleton h-4 w-1/3 rounded" /><div className="carelink-skeleton h-3 w-2/3 rounded" /></div><div className="carelink-skeleton h-7 w-20 rounded-full" /></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="carelink-skeleton h-8 rounded-lg" /><div className="carelink-skeleton h-8 rounded-lg" /><div className="carelink-skeleton h-8 rounded-lg" /><div className="carelink-skeleton h-8 rounded-lg" /></div></div>)}</div>}
    {resourceType === 'pharmacy' && !loading && pharmacyResults.some((item) => item.availability === 'unverified') && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Some stock records could not be verified with a pharmacy-specific update from the last six hours. These quantities are shown as unverified and cannot be ordered from Smart Match.</p>}
    {resourceType === 'pharmacy' && process.env.NODE_ENV !== 'production' && pharmacyResults.some((item) => item.isDemo) && <p role="status" className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">DEMO DATA: some pharmacy or medicine records in this environment are built-in examples, not live provider inventory.</p>}
    {resourceType === 'pharmacy' && !loading && !error && <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3"><label className="text-xs font-semibold text-slate-700">Availability<select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as typeof availabilityFilter)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="all">All records</option><option value="verified_available">Verified available</option><option value="verified_unavailable">Verified insufficient</option><option value="unverified">Unverified</option></select></label><label className="text-xs font-semibold text-slate-700">Minimum match<select value={pharmacyMinimumScore} onChange={(event) => setPharmacyMinimumScore(Number(event.target.value))} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value={0}>Any score</option><option value={50}>50%+</option><option value={70}>70%+</option><option value={85}>85%+</option></select></label><label className="text-xs font-semibold text-slate-700">Sort by<select value={pharmacySort} onChange={(event) => setPharmacySort(event.target.value as typeof pharmacySort)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="match">Best match</option><option value="distance">Closest</option></select></label><p className="text-xs text-slate-500">Score = medicine {pharmacyWeights.medicine}% + verified stock {pharmacyWeights.stock}% + distance {pharmacyWeights.distance}%. A missing stock check cannot be offset by the score.</p></section>}
    {resourceType === 'pharmacy' && !loading && !error && originValid && filteredPharmacies.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{pharmacyResults.length ? 'No pharmacy records match these filters.' : 'No matching medicine records were found within this search radius.'}</p>}
    {resourceType === 'pharmacy' && !loading && !error && filteredPharmacies.length > 0 && <section className="space-y-3"><h2 className="text-lg font-bold text-slate-900">Pharmacy matches <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{filteredPharmacies.length}</span></h2><div className="grid gap-4 lg:grid-cols-2">{filteredPharmacies.map((item) => <article key={item.pharmacyId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className="rounded-xl bg-violet-50 p-3 text-violet-700"><Pill className="h-5 w-5" /></span><div className="min-w-0"><h3 className="font-bold text-slate-900">{item.pharmacyName}</h3><p className="mt-1 text-xs text-slate-500">{item.address}</p></div></div><span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-bold text-sky-800">{item.score}% match</span></div><div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{item.medicineName} · {item.formulation}</span><span className={`rounded-full px-2.5 py-1 font-bold ${item.availability === 'verified_available' ? 'bg-emerald-50 text-emerald-800' : item.availability === 'verified_unavailable' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}>{item.availability === 'verified_available' ? 'Verified in stock' : item.availability === 'verified_unavailable' ? 'Verified insufficient stock' : 'Availability unverified'}</span></div><p className="mt-3 text-sm text-slate-700">{item.availability === 'unverified' ? 'Recorded quantity cannot be confirmed as current.' : `${item.availableQuantity ?? 0} unit(s) recorded · ${item.requestedQuantity} requested`}{item.distanceKm == null ? '' : ` · ${item.distanceKm} km away`}</p><p className="mt-1 text-xs text-slate-500">Stock updated: {item.stockUpdatedAt ? new Date(item.stockUpdatedAt).toLocaleString() : 'No recent verified update'}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void loadMatchExplanation('pharmacy', item.pharmacyId)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-sky-800">{explained === 'pharmacy:' + item.pharmacyId ? 'Hide match details' : 'Match details'}</button>{item.phone && <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Phone className="h-3.5 w-3.5" />Contact</a>}<button type="button" disabled={item.availability !== 'verified_available' || ordering === item.pharmacyId} onClick={() => void orderMedicine(item)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{ordering === item.pharmacyId ? 'Sending…' : item.availability === 'verified_available' ? 'Request medicine' : 'Stock check required'}</button></div>{explained === 'pharmacy:' + item.pharmacyId && <div className="mt-4 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-950"><p>{explanationLoading === 'pharmacy:' + item.pharmacyId ? 'Building a data-grounded explanation…' : aiExplanations['pharmacy:' + item.pharmacyId] ?? item.explanation}</p><ul className="mt-2 list-disc pl-5"><li>Medicine record matched: 100% identity factor · {item.scoreContributions.medicine} score points.</li><li>Requested quantity: {item.availability === 'verified_available' ? 'verified available' : item.availability === 'verified_unavailable' ? 'verified insufficient' : 'could not be verified'} · {item.scoreContributions.stock} score points.</li><li>Distance factor: {Math.round(item.scoreBreakdown.distance * 100)}% · {item.scoreContributions.distance} score points.</li></ul><p className="mt-2">A missing stock check is a mandatory eligibility failure and cannot be offset by the score.</p></div>}</article>)}</div></section>}
    {resourceType === 'hospital' && !loading && !error && originValid && filteredResults.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{results.length ? 'No hospitals match this search.' : 'No eligible hospitals matched these requirements. Try a wider travel limit or fewer required facilities.'}</p>}
    {resourceType === 'hospital' && process.env.NODE_ENV !== 'production' && filteredResults.some((item) => item.isDemo) && <p role="status" className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">DEMO DATA: some hospital records are test examples, not live capacity confirmations.</p>}
    {resourceType === 'hospital' && !loading && filteredResults.length > 0 && <><h2 className="text-lg font-bold text-slate-900">Top Matches <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{filteredResults.length}</span></h2><div className="space-y-4">{filteredResults.map((result, index) => {
      const resource = getSelectedBed(result); const available = resource?.availableQuantity ?? 0;
      const relevantTimes = result.resources.filter((item) => result.matchedResources.some((need) => categoryMatches(need, item.category))).map((item) => item.updatedAt ? Date.parse(item.updatedAt) : Number.NaN).filter(Number.isFinite);
      const latestResourceUpdate = relevantTimes.length ? Math.max(...relevantTimes) : Number.NaN;
      const availabilityStale = !Number.isFinite(latestResourceUpdate) || result.scoreBreakdown.freshness < 0.5;
      const activeHold = role === 'patient' ? holds.find((hold) => hold.hospitalId === result.hospitalId && ['queued', 'pending', 'confirmed'].includes(hold.status)) : undefined;
      return <article key={result.hospitalId} className={`rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md ${index === 0 ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-700 text-sm font-black text-white">{index + 1}</span><h3 className="text-base font-bold text-slate-900">{result.name}</h3><span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">{Math.round(result.score)}% match</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{result.status}</span></div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">{result.matchedResources.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">Matches {item.replaceAll('_', ' ')}</span>)}{result.missingResources.map((item) => <span key={item} className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">No live match for {item.replaceAll('_', ' ')}</span>)}</div>
          <p className="mt-2 text-xs text-slate-600">{result.matchedResources.length ? `Inventory records list ${result.matchedResources.map((item) => item.replaceAll('_', ' '))} as available.` : 'No requested specialty or equipment is currently listed as available in inventory.'} Travel estimate {result.travelTimeMinutes == null ? 'unavailable' : `~${Math.ceil(result.travelTimeMinutes)} min`} · {result.distanceKm} km.</p>
          <p className={`mt-2 text-xs ${availabilityStale ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>{availabilityStale ? 'Availability data may be stale or lacks a resource timestamp.' : `Relevant resource data updated ${new Date(latestResourceUpdate).toLocaleString()}.`}{result.availabilityUpdatedAt ? ` Hospital record updated ${new Date(result.availabilityUpdatedAt).toLocaleString()}.` : ''}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4"><span>Resource fit <b>{Math.round(result.scoreBreakdown.resourceMatch * 100)}%</b></span><span>Travel <b>{result.travelTimeMinutes == null ? '—' : `${Math.ceil(result.travelTimeMinutes)} min`}</b></span><span>Freshness <b>{Math.round(result.scoreBreakdown.freshness * 100)}%</b></span><span>{bedCategory} beds <b>{available} recorded available</b></span></div>
          {result.resources.some((item) => item.type === 'bed') && <p className="mt-2 text-xs text-slate-600">Registered beds: {result.resources.filter((item) => item.type === 'bed').map((item) => `${item.category.replaceAll('_', ' ')} ${item.availableQuantity}/${item.totalQuantity} recorded`).join(' · ')}</p>}
        </div><div className="flex shrink-0 flex-col gap-2 sm:items-end"><button type="button" onClick={() => void requestBed(result)} disabled={requesting === result.hospitalId || !resource || Boolean(activeHold)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{requesting === result.hospitalId ? 'Sending…' : activeHold?.status === 'pending' ? 'Request pending' : activeHold?.status === 'queued' ? 'In queue' : activeHold?.status === 'confirmed' ? 'Confirmed' : resource ? `Request ${bedCategory} bed` : `No ${bedCategory} bed record`}</button><button type="button" onClick={() => { setSelectedHospitalId(result.hospitalId); setActiveTab('hospital-view'); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">View details</button><button type="button" onClick={() => void loadMatchExplanation('hospital', result.hospitalId)} className="text-xs font-semibold text-sky-800 hover:underline">{explained === 'hospital:' + result.hospitalId ? 'Hide explanation' : 'Why this match?'}</button>{activeHold?.status === 'queued' && activeHold.queuePosition && <span className="max-w-44 text-right text-[11px] text-slate-600">Queue position {activeHold.queuePosition}</span>}{resource && available === 0 && !activeHold && <span className="max-w-44 text-right text-[11px] text-amber-800">A request can still join the queue.</span>}</div></div>
        {explained === 'hospital:' + result.hospitalId && <p className="mt-4 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-950">{explanationLoading === 'hospital:' + result.hospitalId ? 'Building a data-grounded explanation…' : aiExplanations['hospital:' + result.hospitalId] ?? buildMatchExplanation(result)}</p>}
      </article>;
    })}</div></>}
  </div>;
};
