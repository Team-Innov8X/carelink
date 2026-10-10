'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { ArrowLeft, MapPin, Send, Sparkles, User } from '@/components/icons';

type MatchResource = { id: string; type: string; category: string; totalQuantity: number; availableQuantity: number };
type MatchResult = {
  hospitalId: string; name: string; status: string; score: number; travelTimeMinutes: number | null;
  distanceKm: number; matchedResources: string[]; missingResources: string[];
  address: string | null; lastUpdated: string | null; stale: boolean; confirmationStatus: string; isDemo: boolean;
  scoreBreakdown: { resourceMatch: number; travelTime: number; freshness: number; availability: number };
  scoreContributions: { resourceMatch: number; travelTime: number; freshness: number; availability: number; statusPenalty: number };
  resources: MatchResource[];
};
type PharmacyMatch = { id: string; name: string; address: string; medicineName: string; formulation: string; stock: number; distanceKm: number; score: number; lastUpdated: string | null; stale: boolean; confirmationStatus: string; dataStatus: string; isDemo: boolean };
type PatientHold = { id: string; hospitalId: string; hospitalName: string; status: string; queuePosition?: number; expiresAt?: string; reason?: string; createdAt: string };
type MatchPriority = 'balanced' | 'resources' | 'travel' | 'freshness';
type AssistantMessage = { role: 'user' | 'assistant'; text: string };

const smartSearchExamples = [
  'Find cardiac care with an ICU bed within 30 minutes, fastest route first',
  'I need trauma care nearby, prioritize the closest hospital',
  'Find pediatric emergency care and the freshest hospital information',
  'Find an ICU bed within 30 minutes in Pune',
  'Find a neurologist with an ICU bed near Delhi',
  'Find pharmacy for paracetamol 500 mg tablet, quantity 10, near New Delhi',
  'Find pharmacy for paracetamol 500 mg tablet, quantity 10, near Pune',
  'Find pharmacy for Cetirizine 10 mg tablet, quantity 8, near Pune',
];
const locationPrompt = 'Type your city, neighborhood, or street address here (e.g. New Delhi or MG Road, Bengaluru). No coordinates needed.';
const extractLocationSuffix = (message: string) => {
  const match = /\b(?:in|near|around|at)\s+([^,.;!?]+(?:,\s*[^!?]+)?)$/i.exec(message);
  const query = match?.[1]?.trim();
  if (!match || !query || /^(?:me|my location|nearby|there)$/i.test(query)) return null;
  const careRequest = message.slice(0, match.index).replace(/[\s,.;!?]+$/, '').trim();
  return { query, careRequest: careRequest || message };
};
const parsePharmacyRequest = (message: string) => {
  if (!/\bpharmacy\b|\b(?:find|need|get|buy|looking for|search for)\s+(?:me\s+)?(?:a\s+)?(?:medicine|medication|drug)\b/i.test(message)) return null;
  const quantity = /\b(?:quantity|qty)\s*[:=]?\s*(\d{1,4})\b/i.exec(message);
  const rawFormulation = /\b(tablets?|capsules?|syrup|suspension|injection|inhaler|cream|ointment|drops?)\b/i.exec(message)?.[1]?.toLowerCase();
  const formulation = rawFormulation === 'tablets' ? 'tablet' : rawFormulation === 'capsules' ? 'capsule' : rawFormulation;
  const marker = /\b(?:medicine|medication|drug|pharmacy)\s+(?:called\s+|for\s+)?/i.exec(message);
  if (!marker) return { name: '', formulation, quantity: quantity ? Number(quantity[1]) : 1 };
  const name = message.slice(marker.index + marker[0].length)
    .replace(/\b(?:quantity|qty)\s*[:=]?\s*\d{1,4}\b.*$/i, '')
    .replace(/\b(?:tablets?|capsules?|syrup|suspension|injection|inhaler|cream|ointment|drops?)\b/ig, '')
    .replace(/[,.!?;]+$/g, '')
    .trim();
  return { name: name.slice(0, 160), formulation, quantity: quantity ? Number(quantity[1]) : 1 };
};
const geocodeAddress = async (address: string) => {
  const city = address.trim().toLowerCase().split(',')[0].trim();
  if (/^(pune|pune city)$/.test(city)) return { latitude: 18.5204, longitude: 73.8567 };
  if (/^(delhi|new delhi|nct of delhi)$/.test(city)) return { latitude: 28.6139, longitude: 77.209 };
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Address lookup is unavailable right now. Try again or use your location.');
  const [match] = await response.json() as { lat: string; lon: string }[];
  const latitude = Number(match?.lat);
  const longitude = Number(match?.lon);
  if (!match || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('We could not find that address. Try a nearby city or area.');
  }
  return { latitude, longitude };
};
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
  const [patientLatitude, setPatientLatitude] = useState('');
  const [patientLongitude, setPatientLongitude] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [locationMessage, setLocationMessage] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [bedCategory, setBedCategory] = useState('general');
  const [maxTravelMinutes, setMaxTravelMinutes] = useState(role === 'patient' ? '60' : String(currentEmergency?.etaLimitMin || 60));
  const [sortBy, setSortBy] = useState<'match' | 'distance' | 'eta'>('match');
  const [priority, setPriority] = useState<MatchPriority>('balanced');
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>(currentEmergency?.priority === 'Critical' ? 'emergency' : currentEmergency?.priority === 'High' ? 'urgent' : 'routine');
  const [medicineName, setMedicineName] = useState('');
  const [medicineFormulation, setMedicineFormulation] = useState('');
  const [medicineQuantity, setMedicineQuantity] = useState('1');
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const topMatchesRef = useRef<HTMLHeadingElement>(null);
  const pharmacyMatchesRef = useRef<HTMLElement>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [awaitingLocation, setAwaitingLocation] = useState(false);
  const [chatPendingAddress, setChatPendingAddress] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState('');
  const [criteriaSource, setCriteriaSource] = useState<'grok' | 'groq' | 'fallback' | ''>('');
  const [explained, setExplained] = useState<string | null>(null);
  const [explanationTexts, setExplanationTexts] = useState<Record<string, string>>({});
  const [results, setResults] = useState<MatchResult[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [pharmacyResults, setPharmacyResults] = useState<PharmacyMatch[]>([]);
  const [activeWeights, setActiveWeights] = useState({ resourceMatch: 50, travelTime: 30, freshness: 20, availability: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchVersion, setSearchVersion] = useState(0);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [holds, setHolds] = useState<PatientHold[]>([]);

  useEffect(() => {
    const chat = chatMessagesRef.current;
    if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  }, [assistantMessages, assistantBusy]);

  useEffect(() => {
    if (loading) return;
    const target = results.length ? topMatchesRef.current : pharmacyResults.length ? pharmacyMatchesRef.current : null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, results.length, pharmacyResults.length]);

  useEffect(() => {
    if (role !== 'patient') return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/holds/mine', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error('Bed request status is temporarily unavailable.');
        if (active) setHolds(result.holds ?? []);
      } catch { /* Keep the last known request state if a refresh fails. */ }
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
  const preferredResourcesKey = '';

  useEffect(() => {
    if (!originValid || !condition.trim()) {
      const invalidTimer = window.setTimeout(() => {
        setLoading(false); setResults([]); setPharmacyResults([]);
        setError('');
      }, 0);
      return () => window.clearTimeout(invalidTimer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch('/api/rank', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ emergencyType: condition.trim(), requiredResources: [...new Set([...requirementsKey.split('|').filter(Boolean), bedCategory])], preferredResources: preferredResourcesKey.split('|').filter(Boolean), ambulanceLocation: { latitude, longitude }, maxTravelMinutes: Number(maxTravelMinutes), bedCategory, priority, urgency, demoFallback: role === 'patient', ...(medicineName.trim() ? { medicine: { name: medicineName.trim(), ...(medicineFormulation.trim() ? { formulation: medicineFormulation.trim() } : {}), quantity: Number(medicineQuantity) } } : {}), limit: 100 }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not find matching hospitals.');
        setResults(Array.isArray(result.ranked) ? result.ranked : []);
        setPharmacyResults(Array.isArray(result.pharmacies) ? result.pharmacies : []);
        setDemoMode(Boolean(result.demoMode));
        if (result.rankingWeights) setActiveWeights(result.rankingWeights);
      } catch (cause) {
        if (!controller.signal.aborted) { setResults([]); setPharmacyResults([]); setError(cause instanceof Error ? cause.message : 'Could not find matching hospitals.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, searchVersion ? 0 : 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [originValid, latitude, longitude, condition, requirementsKey, preferredResourcesKey, bedCategory, maxTravelMinutes, priority, urgency, medicineName, medicineFormulation, medicineQuantity, searchVersion, role, patientLatitude, patientLongitude]);

  const filteredResults = useMemo(() => results
    .slice()
    .sort((a, b) => sortBy === 'distance' ? a.distanceKm - b.distanceKm : sortBy === 'eta' ? (a.travelTimeMinutes ?? Infinity) - (b.travelTimeMinutes ?? Infinity) : b.score - a.score || a.distanceKm - b.distanceKm), [results, sortBy]);

  const getSelectedBed = (result: MatchResult) => result.resources.find((resource) => resource.type === 'bed' && Boolean(resource.id) && categoryMatches(bedCategory, resource.category));

  const requestExplanation = async (result: MatchResult, chatMessage?: string) => {
    if (assistantBusy) return;
    setAssistantBusy(true); setAssistantError(''); setExplained(result.hospitalId);
    if (chatMessage) setAssistantMessages((current) => [...current, { role: 'user', text: chatMessage }]);
    try {
      const matchCriteria = { emergencyType: condition.trim() || bedCategory, requiredResources: [...new Set([...requestedResources, bedCategory])], preferredResources: preferredResourcesKey.split('|').filter(Boolean), ambulanceLocation: { latitude, longitude }, maxTravelMinutes: Number(maxTravelMinutes), bedCategory, priority, urgency, limit: 100 };
      const response = await fetch('/api/rank/assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'explain', message: 'Explain this match.', current: { emergencyType: condition.trim(), requiredResources: requestedResources, bedCategory, maxTravelMinutes: Number(maxTravelMinutes), priority }, hospitalId: result.hospitalId, matchCriteria }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not explain this match.');
      setExplanationTexts((current) => ({ ...current, [result.hospitalId]: body.explanation }));
      if (chatMessage) setAssistantMessages((current) => [...current, { role: 'assistant', text: `${body.explanation}${body.source === 'fallback' ? ' (Grounded local explanation; AI provider unavailable.)' : ''}` }]);
    } catch (cause) {
      setAssistantError(cause instanceof Error ? cause.message : 'Could not explain this match.');
      if (chatMessage) setAssistantMessages((current) => [...current, { role: 'assistant', text: 'I could not rebuild a current explanation. Refresh the results and try again.' }]);
    } finally { setAssistantBusy(false); }
  };

  const interpretSearch = async (message: string, mode: 'search' | 'refine' = 'refine') => {
    const trimmed = message.trim();
    if (!trimmed || assistantBusy) return;
    if (role === 'patient' && awaitingLocation) {
      setAssistantBusy(true);
      setAssistantError('');
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }]);
      try {
        const point = await geocodeAddress(trimmed);
        setPatientAddress(trimmed);
        setPatientLatitude(String(point.latitude));
        setPatientLongitude(String(point.longitude));
        setAwaitingLocation(false);
        setChatPendingAddress('');
        setPendingQuestion(null);
        setLocationMessage(`Searching near ${trimmed}…`);
        setSearchVersion((version) => version + 1);
        setAssistantMessages((current) => [...current, { role: 'assistant', text: `Got it. I’m finding matches near ${trimmed}.` }]);
      } catch (cause) {
        const messageText = cause instanceof Error ? cause.message : 'I could not find that location. Try a city or nearby area.';
        setAssistantError(messageText);
        setAssistantMessages((current) => [...current, { role: 'assistant', text: messageText }]);
      } finally { setAssistantBusy(false); }
      return;
    }
    if (/\b(explain|why)\b/i.test(trimmed) && /\b(match|recommend|result|hospital|this)\b/i.test(trimmed) && results.length) {
      const named = results.find((item) => trimmed.toLowerCase().includes(item.name.toLowerCase()));
      const result = named ?? results[0];
      await requestExplanation(result, trimmed);
      return;
    }
    const mentionsCareNeed = /\b(icu|intensive care|critical care|trauma|accident|injury|ventilator|respiratory|cardiac|cardiology|heart|chest pain|stroke|neurolog|brain|orthop|fracture|bone|pediatric|paediatric|child|defibrillator|oxygen|dialysis|ecg|ekg|maternity|emergency room|general bed)\b/i.test(trimmed);
    const changesLocation = role === 'patient' && Boolean(extractLocationSuffix(trimmed));
    if (results.length && !mentionsCareNeed && !changesLocation && /\b(fastest|quickest|fast route|eta)\b/i.test(trimmed)) {
      setPriority('travel'); setSortBy('eta'); setSearchVersion((version) => version + 1);
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: 'I’ll prioritize reported travel estimates for the current request. Any unavailable route estimates will remain clearly marked.' }]);
      return;
    }
    if (results.length && !mentionsCareNeed && !changesLocation && /\b(closest|nearest|closer|shortest distance)\b/i.test(trimmed)) {
      setSortBy('distance');
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: 'I’ve reordered the eligible matches by the reported distance from your location.' }]);
      return;
    }
    if (/\b(alternatives?|similar)\b/i.test(trimmed) && results.length) {
      setSortBy(/fastest|quickest|eta|minutes/i.test(trimmed) ? 'eta' : /closer|nearest|closest|distance/i.test(trimmed) ? 'distance' : 'match');
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: `Showing the other hospitals returned by the live matching system, ranked by ${/closer|nearest|faster|quick/i.test(trimmed) ? 'distance' : 'the same requirements and compatibility factors'}.` }]);
      return;
    }
    const locationSuffix = role === 'patient' ? extractLocationSuffix(trimmed) : null;
    const addressQuery = locationSuffix?.query || chatPendingAddress || (role === 'patient' && patientAddress !== 'Current location' && !patientLatitude && !patientLongitude ? patientAddress.trim() : '');
    const criteriaMessage = locationSuffix?.careRequest || trimmed;
    const pharmacyRequest = parsePharmacyRequest(criteriaMessage);
    if (pharmacyRequest) {
      setAssistantBusy(true);
      setAssistantError('');
      setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }]);
      if (!pharmacyRequest.name || (pharmacyRequest.quantity < 1 || pharmacyRequest.quantity > 1000)) {
        const prompt = 'Tell me the exact medicine name and strength, formulation, and quantity, for example: “Find pharmacy for paracetamol 500 mg tablet, quantity 10, near New Delhi.”';
        setAssistantMessages((current) => [...current, { role: 'assistant', text: prompt }]);
        setAssistantBusy(false);
        return;
      }
      setMedicineName(pharmacyRequest.name);
      setMedicineFormulation(pharmacyRequest.formulation ?? '');
      setMedicineQuantity(String(pharmacyRequest.quantity));
      setCondition(condition.trim() || 'Pharmacy medicine search');
      setRequirements('');
      setUrgency(/\b(emergency|life[- ]threatening|immediately|asap)\b/i.test(trimmed) ? 'emergency' : /\burgent(?:ly)?\b/i.test(trimmed) ? 'urgent' : urgency);
      setCriteriaSource('fallback');
      setPendingQuestion(null);
      if (role === 'patient' && addressQuery) {
        try {
          const point = await geocodeAddress(addressQuery);
          setPatientAddress(addressQuery); setPatientLatitude(String(point.latitude)); setPatientLongitude(String(point.longitude));
          setChatPendingAddress(''); setAwaitingLocation(false); setSearchVersion((version) => version + 1);
          setAssistantMessages((current) => [...current, { role: 'assistant', text: `I’ll look for ${pharmacyRequest.quantity} of ${pharmacyRequest.name}${pharmacyRequest.formulation ? ` (${pharmacyRequest.formulation})` : ''} near ${addressQuery}. Pharmacy inventory is shown only when a matching record exists.` }]);
        } catch (cause) {
          const messageText = cause instanceof Error ? cause.message : 'I could not find that location. Try a city or nearby area.';
          setAwaitingLocation(true); setPendingQuestion('Type a city, neighborhood, or street address…');
          setAssistantMessages((current) => [...current, { role: 'assistant', text: `${messageText} Your medicine request is saved. ${locationPrompt}` }]);
        }
      } else if (role === 'patient' && !(patientLatitude && patientLongitude)) {
        setAwaitingLocation(true); setPendingQuestion('Type a city, neighborhood, or street address…');
        setAssistantMessages((current) => [...current, { role: 'assistant', text: `I’ve noted ${pharmacyRequest.name}${pharmacyRequest.formulation ? ` (${pharmacyRequest.formulation})` : ''}, quantity ${pharmacyRequest.quantity}. ${locationPrompt}` }]);
      } else {
        setSearchVersion((version) => version + 1);
        setAssistantMessages((current) => [...current, { role: 'assistant', text: `I’ll check for ${pharmacyRequest.quantity} of ${pharmacyRequest.name}${pharmacyRequest.formulation ? ` (${pharmacyRequest.formulation})` : ''}.` }]);
      }
      setAssistantBusy(false);
      return;
    }
    setAssistantBusy(true); setAssistantError(''); setAssistantMessages((current) => [...current, { role: 'user', text: trimmed }]);
    try {
      const response = await fetch('/api/rank/assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: criteriaMessage, mode, fastMode: true, ...(pendingQuestion && !awaitingLocation ? { pendingQuestion } : {}), current: { emergencyType: condition, requiredResources: requestedResources, bedCategory, maxTravelMinutes: Number(maxTravelMinutes), priority } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not refine your search.');
      if (body.needsClarification) {
        setPendingQuestion(body.clarificationQuestion);
        if (addressQuery) setChatPendingAddress(addressQuery);
        setCriteriaSource(body.source);
        setAssistantMessages((current) => [...current, { role: 'assistant', text: body.clarificationQuestion }]);
        return;
      }
      setCondition(body.criteria.emergencyType);
      setRequirements(body.criteria.requiredResources.join(', '));
      setBedCategory(body.criteria.bedCategory);
      setMaxTravelMinutes(String(body.criteria.maxTravelMinutes));
      setPriority(body.criteria.priority);
      if (/\b(emergency|life[- ]threatening|immediately|asap)\b/i.test(trimmed)) setUrgency('emergency');
      else if (/\burgent(?:ly)?\b/i.test(trimmed)) setUrgency('urgent');
      else if (/\broutine\b/i.test(trimmed)) setUrgency('routine');
      setSortBy(/fastest|quickest|eta/i.test(trimmed) ? 'eta' : /closer|nearest|closest|distance/i.test(trimmed) ? 'distance' : 'match');
      setCriteriaSource(body.source);
      setPendingQuestion(null);
      if (role === 'patient' && addressQuery) {
        try {
          const point = await geocodeAddress(addressQuery);
          setPatientAddress(addressQuery);
          setPatientLatitude(String(point.latitude));
          setPatientLongitude(String(point.longitude));
          setChatPendingAddress('');
          setAwaitingLocation(false);
          setLocationMessage(`Searching near ${addressQuery}…`);
          setSearchVersion((version) => version + 1);
          setAssistantMessages((current) => [...current, { role: 'assistant', text: `${body.reply}${body.source === 'fallback' ? ' (Using local search interpretation.)' : ''} I’m searching near ${addressQuery}.` }]);
        } catch (cause) {
          const messageText = cause instanceof Error ? cause.message : 'I could not find that location. Try a city or nearby area.';
          setAwaitingLocation(true);
          setPendingQuestion('Type a city, neighborhood, or street address…');
          setAssistantMessages((current) => [...current, { role: 'assistant', text: `${body.reply} ${messageText} ${locationPrompt}` }]);
        }
      } else if (role === 'patient' && !(patientLatitude && patientLongitude)) {
        setAwaitingLocation(true);
        setPendingQuestion('Type a city, neighborhood, or street address…');
        setAssistantMessages((current) => [...current, { role: 'assistant', text: `${body.reply} ${locationPrompt} Or choose “Use my location.”` }]);
      } else {
        setSearchVersion((version) => version + 1);
        setAssistantMessages((current) => [...current, { role: 'assistant', text: `${body.reply}${body.source === 'fallback' ? ' (Using local search interpretation.)' : ''}` }]);
      }
    } catch (cause) {
      setAssistantError(cause instanceof Error ? cause.message : 'Could not refine your search.');
      setAssistantMessages((current) => [...current, { role: 'assistant', text: 'I could not update those criteria. Your current results and preferences are unchanged.' }]);
    } finally { setAssistantBusy(false); }
  };

  const useMyLocation = () => {
    setLocationMessage('');
    if (!navigator.geolocation) { setLocationMessage('This browser does not support location access. Tell me your city or area in the chat.'); return; }
    setLocationLoading(true);
    setLocationMessage('Requesting your location…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPatientLatitude(String(coords.latitude));
      setPatientLongitude(String(coords.longitude));
      setPatientAddress('Current location');
      setAwaitingLocation(false);
      setChatPendingAddress('');
      setPendingQuestion(null);
      setLocationMessage(condition.trim() ? 'Location added. Finding matching hospitals…' : 'Location added. Enter the care needed to find matching hospitals.');
      setAssistantMessages((current) => [...current, { role: 'assistant', text: condition.trim() ? 'Got your location. I’m finding nearby matches now.' : 'Got your location. What kind of care do you need?' }]);
      setLocationLoading(false);
    }, (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? 'Location access is blocked. Allow location access for localhost, or tell me your city or area in the chat.'
        : error.code === error.POSITION_UNAVAILABLE
          ? 'Your device could not determine a location. Check device location services or tell me your city or area in the chat.'
          : error.code === error.TIMEOUT
            ? 'The location request timed out. Try again or tell me your city or area in the chat.'
            : 'Could not access your location. Try again or tell me your city or area in the chat.';
      setLocationMessage(message);
      setAssistantMessages((current) => [...current, { role: 'assistant', text: message }]);
      setLocationLoading(false);
    }, { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 });
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

  const matchStatus = error
    ? error
    : loading
      ? 'Searching current hospital and pharmacy inventory…'
      : !originValid
        ? role === 'patient' && (patientLatitude || patientLongitude) ? 'I could not validate that location. Type your city, neighborhood, or street address in the chat, or use your location.' : 'Tell me what care or medicine you need and type your city, neighborhood, or street address in the chat, or use your location.'
        : !condition.trim()
          ? 'Tell me what care or service you need in the chat to find matches.'
    : results.length || pharmacyResults.length
            ? `${demoMode ? 'DEMO DATA · ' : ''}${results.length ? `${results.length} hospital ${results.length === 1 ? 'match' : 'matches'}` : 'No hospital matches'}${medicineName.trim() ? ` · ${pharmacyResults.length ? `${pharmacyResults.length} pharmacy ${pharmacyResults.length === 1 ? 'match' : 'matches'}` : 'no reported pharmacy stock match'}` : ''} found for your request.${demoMode ? ' Fictional samples for Pune and Delhi only; availability and travel estimates are not live.' : ''}`
            : medicineName.trim()
              ? `No hospital or reported pharmacy inventory matched ${medicineName}. Try another location or medicine description.`
              : 'No eligible hospitals matched. Try adjusting your requirements or travel limit in the chat.';
  const matchStatusClass = error ? 'border-rose-200 bg-rose-50 text-rose-800' : loading || !originValid || !condition.trim() ? 'border-sky-200 bg-sky-50 text-sky-900' : results.length || pharmacyResults.length ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900';

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => setActiveTab('dashboard')} className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to Dashboard</button>
      {role !== 'patient' && emergencies.length > 0 && <label className="flex items-center gap-2 text-xs text-slate-500">Switch case<select value={currentEmergency?.id ?? ''} onChange={(event) => { const selected = emergencies.find((item) => item.id === event.target.value); setSelectedEmergencyId(event.target.value); setCondition(selected?.condition ?? ''); setRequirements(selected?.requiredFacilities.join(', ') ?? ''); setMaxTravelMinutes(String(selected?.etaLimitMin || 60)); }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-800">{emergencies.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.condition}</option>)}</select></label>}
    </div>

    <header><h1 className="text-2xl font-bold tracking-tight text-slate-900">{role === 'patient' ? 'Find a matching hospital' : 'Recommended Hospitals for Patient'}</h1><p className="mt-1 text-sm text-slate-500">Matches rank recorded hospital resources, travel information, and data freshness. Clearly labeled demo samples are not live facility data.</p></header>

    {!(demoMode && (results.length > 0 || pharmacyResults.length > 0)) && <p role={error ? 'alert' : 'status'} aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${matchStatusClass}`}>{loading && <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />}{matchStatus}</p>}

    <section className="overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-lg shadow-sky-950/5" aria-label="Smart Match chat">
      <div className="bg-gradient-to-r from-sky-800 via-sky-700 to-cyan-600 px-5 py-5 text-white sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Sparkles className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">Smart Match</h2><span className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-50">CARE ASSISTANT</span>{demoMode && <span className="rounded-full border border-amber-200/60 bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-50">DEMO PREVIEW</span>}</div><p className="mt-1 max-w-2xl text-xs leading-5 text-sky-50/95">Tell me what care or medicine you need and where. Add urgency, bed type, travel limit, or preferences naturally—I’ll find matches from recorded inventory.</p></div>
        </div>
        {urgency === 'emergency' && <p role="alert" className="mt-4 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs leading-5 text-white">If this is life-threatening, contact local emergency services now. Smart Match does not dispatch emergency care.</p>}
      </div>
      <div className="space-y-4 bg-gradient-to-b from-sky-50/70 to-white p-4 sm:p-6">
        <div ref={chatMessagesRef} className="max-h-80 min-h-52 space-y-3 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-4 shadow-inner shadow-slate-100/80" aria-live="polite">
          {assistantMessages.length === 0 && <div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800"><Sparkles className="h-4 w-4" /></span><div className="max-w-[90%] rounded-2xl rounded-tl-md border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-slate-700"><p className="font-semibold text-slate-900">Hi, I’m here to help.</p><p>Describe the care you need and your location. You can also ask for a medicine by name, strength, formulation, and quantity.</p><p className="mt-2 text-xs text-slate-500">For example: “ICU bed within 30 minutes near New Delhi.” You can type just your city or area when I ask—no coordinates needed.</p></div></div>}
          {assistantMessages.map((item, index) => <div key={`${item.role}-${index}`} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {item.role === 'assistant' && <span className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-800"><Sparkles className="h-3.5 w-3.5" /></span>}
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${item.role === 'user' ? 'rounded-tr-md bg-sky-800 text-white' : 'rounded-tl-md border border-slate-100 bg-white text-slate-700'}`}><span className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${item.role === 'user' ? 'text-sky-100' : 'text-slate-400'}`}>{item.role === 'user' ? 'You' : 'CareLink assistant'}</span>{item.text}</div>
          </div>)}
        {assistantBusy && <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-800"><Sparkles className="h-3.5 w-3.5" /></span><p className="rounded-2xl rounded-tl-md border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500"><span className="mr-2 inline-flex gap-1 align-middle"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:240ms]" /></span>{awaitingLocation ? 'Looking up that location…' : 'Checking current matches…'}</p></div>}
        </div>
        {!loading && results.length > 0 && <div aria-label="Suggested follow-up questions"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Next steps</p><div className="flex flex-wrap gap-2"><button type="button" disabled={assistantBusy} onClick={() => void requestExplanation(results[0], 'Explain the top match')} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 transition hover:bg-sky-100 disabled:opacity-50">Why this top match?</button><button type="button" disabled={assistantBusy} onClick={() => void interpretSearch('Find the fastest route', 'refine')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50">Fastest route</button><button type="button" disabled={assistantBusy} onClick={() => void interpretSearch('Find the closest hospital', 'refine')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50">Closest hospital</button></div></div>}
        {role === 'patient' && locationMessage && <p role="status" className="text-xs text-sky-800">{locationMessage}</p>}
        <form onSubmit={(event) => { event.preventDefault(); const message = assistantInput; setAssistantInput(''); void interpretSearch(message, condition.trim() ? 'refine' : 'search'); }} className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm transition focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100">
          <div className="flex items-center gap-2"><input value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} maxLength={1000} placeholder={pendingQuestion || 'Tell me what you need…'} className="min-h-11 min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400" /><button type="submit" aria-label={awaitingLocation ? 'Send location' : 'Find matches'} disabled={assistantBusy || !assistantInput.trim()} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-800 to-cyan-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-sky-900 hover:to-cyan-800 disabled:cursor-not-allowed disabled:opacity-45"><Send className="h-4 w-4" /><span className="hidden sm:inline">{assistantBusy ? 'Working…' : awaitingLocation ? 'Send location' : 'Find matches'}</span></button></div>
          {role === 'patient' && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-2 pt-2"><span className="text-[11px] text-slate-400">Describe it in your own words</span><button type="button" onClick={useMyLocation} disabled={locationLoading || assistantBusy} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-50 disabled:opacity-50"><MapPin className="mr-1 inline h-3.5 w-3.5" />{locationLoading ? 'Locating…' : 'Use my location'}</button></div>}
        </form>
        <div aria-label="Example requests" className="rounded-2xl border border-slate-200/80 bg-white/75 p-3 shadow-sm"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quick-start searches</p><span className="text-[10px] text-slate-400">Tap to send</span></div><div className="flex flex-wrap gap-2">{smartSearchExamples.map((example) => <button key={example} type="button" disabled={assistantBusy} onClick={() => void interpretSearch(example, condition.trim() ? 'refine' : 'search')} className="rounded-full border border-sky-100 bg-sky-50/70 px-3 py-2 text-left text-[11px] font-medium leading-4 text-slate-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-100 hover:text-sky-950 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50">{example}</button>)}</div></div>
        {assistantError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{assistantError}</p>}
        {criteriaSource && <p className="border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-400">Request interpreted by {criteriaSource === 'groq' ? 'Groq' : criteriaSource === 'grok' ? 'Grok' : 'CareLink’s local fallback'}. Matches and scores use the standard engine (resources {activeWeights.resourceMatch}%, travel {activeWeights.travelTime}%, freshness {activeWeights.freshness}%, availability {activeWeights.availability}%).</p>}
      </div>
    </section>

    {role !== 'patient' && (currentEmergency ? <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start gap-3"><User className="mt-1 h-5 w-5 text-sky-700" /><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Case {currentEmergency.id} · {currentEmergency.priority} priority</p><p className="mt-1 font-bold text-slate-900">{currentEmergency.condition}</p><p className="mt-1 text-xs text-slate-500">{currentEmergency.location.address}</p><p className="mt-2 text-xs text-slate-600">Required facilities: {requirements || 'None specified'}</p></div></div></section> : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No emergency case is available to match.</p>)}



    {requestMessage && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{requestMessage}</p>}

    {!loading && filteredResults.length > 0 && <><h2 ref={topMatchesRef} className="scroll-mt-6 text-lg font-bold text-slate-900">Top Matches <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{filteredResults.length}</span></h2><div className="space-y-4">{filteredResults.map((result, index) => {
      const resource = getSelectedBed(result); const available = resource?.availableQuantity ?? 0;
      const activeHold = role === 'patient' ? holds.find((hold) => hold.hospitalId === result.hospitalId && ['queued', 'pending', 'confirmed'].includes(hold.status)) : undefined;
      return <article key={result.hospitalId} className={`rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md ${index === 0 ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-700 text-sm font-black text-white">{index + 1}</span><h3 className="text-base font-bold text-slate-900">{result.name}</h3><span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">{Math.round(result.score)}% match</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{result.status}</span></div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">{result.matchedResources.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">Matches {item.replaceAll('_', ' ')}</span>)}{result.missingResources.map((item) => <span key={item} className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">No live match for {item.replaceAll('_', ' ')}</span>)}</div>
          <p className="mt-2 text-xs text-slate-600">{result.matchedResources.length ? `${result.isDemo ? 'Sample inventory' : 'Reported inventory'} has ${result.matchedResources.map((item) => item.replaceAll('_', ' ')).join(', ')} available.` : 'No requested specialty or equipment is currently available in inventory.'} Distance {result.distanceKm} km · {result.isDemo ? 'sample demo travel time' : 'route travel time'} {result.travelTimeMinutes == null ? 'unavailable' : `~${Math.ceil(result.travelTimeMinutes)} min`}{result.isDemo ? ' (not live route data)' : ''}.</p>
          <p className="mt-1 text-xs text-slate-600">{result.address || 'Address not reported'} · {result.confirmationStatus}{result.lastUpdated ? ` · updated ${new Date(result.lastUpdated).toLocaleString()}` : ' · last update not reported'}{result.stale ? ' · stale data' : ''}{result.isDemo ? ' · demo record' : ''}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4"><span>Resource fit <b>{Math.round(result.scoreBreakdown.resourceMatch * 100)}%</b></span><span>Travel <b>{result.travelTimeMinutes == null ? '—' : `${Math.ceil(result.travelTimeMinutes)} min`}</b></span><span>Freshness <b>{Math.round(result.scoreBreakdown.freshness * 100)}%</b></span><span>{bedCategory} beds <b>{available} available</b></span></div>
        </div><div className="flex shrink-0 flex-col gap-2 sm:items-end"><button type="button" onClick={() => void requestBed(result)} disabled={result.isDemo || requesting === result.hospitalId || !resource || Boolean(activeHold)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{result.isDemo ? 'Demo only · booking unavailable' : requesting === result.hospitalId ? 'Sending…' : activeHold?.status === 'pending' ? 'Booking request pending' : activeHold?.status === 'queued' ? 'In booking queue' : activeHold?.status === 'confirmed' ? 'Bed booking confirmed' : resource ? `Request to book ${bedCategory} bed` : `No ${bedCategory} bed record`}</button>{!result.isDemo && resource && !activeHold && <span className="max-w-52 text-right text-[11px] text-slate-500">The hospital must confirm your booking request.</span>}<button type="button" onClick={() => explained === result.hospitalId ? setExplained(null) : void requestExplanation(result)} className="text-xs font-semibold text-sky-800 hover:underline">{explained === result.hospitalId ? 'Hide explanation' : 'Why this match?'}</button>{activeHold?.status === 'queued' && activeHold.queuePosition && <span className="max-w-44 text-right text-[11px] text-slate-600">Queue position {activeHold.queuePosition}</span>}{resource && available === 0 && !activeHold && !result.isDemo && <span className="max-w-44 text-right text-[11px] text-amber-800">A request can still join the queue.</span>}</div></div>
        {explained === result.hospitalId && <p aria-live="polite" className="mt-4 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-950">{explanationTexts[result.hospitalId] ?? (assistantBusy ? 'Rechecking the current record and preparing an explanation…' : assistantError || 'Explanation unavailable.')}</p>}
      </article>;
    })}</div></>}

    {medicineName.trim() && <section ref={pharmacyMatchesRef} className="scroll-mt-6 space-y-3" aria-live="polite"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-900">Pharmacy matches</h2><span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">{pharmacyResults.length}</span></div><p className="text-xs text-slate-500">Ranked with 60% location fit and 40% reported stock freshness. Stock sufficiency and exact name/formulation are mandatory filters.</p>{!loading && !error && pharmacyResults.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No matching reported demo stock is available. Registered pharmacy inventory is not yet connected to this matcher, so no live stock match or confirmation can be shown.</p>}<div className="grid gap-3 md:grid-cols-2">{pharmacyResults.map((pharmacy) => <article key={pharmacy.id} className="rounded-2xl border border-amber-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{pharmacy.name}</h3><p className="mt-1 text-xs text-slate-600">{pharmacy.address} · {pharmacy.distanceKm} km</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{pharmacy.score}% match</span></div><p className="mt-3 text-sm text-slate-800">{pharmacy.medicineName} · {pharmacy.formulation}</p><p className="mt-1 text-sm text-slate-700">Reported stock: {pharmacy.stock} · {pharmacy.confirmationStatus}</p><p className="mt-2 text-xs text-amber-800">DEMO INVENTORY · Not a live or confirmed stock offer{pharmacy.lastUpdated ? ` · updated ${new Date(pharmacy.lastUpdated).toLocaleString()}` : ' · update time not reported'}{pharmacy.stale ? ' · stale data' : ''}</p></article>)}</div></section>}
  </div>;
};
