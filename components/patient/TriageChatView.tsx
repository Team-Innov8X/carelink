'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneCall,
  Send,
  ShieldAlert,
  LoaderCircle,
  Clock,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Lock,
  Info,
} from '../icons';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  urgency?: 'critical' | 'high' | 'moderate' | 'low' | 'assessing';
  category?: string | null;
  shouldEscalate?: boolean;
  timestamp: string;
}

export interface RankedHospitalResult {
  hospitalId: string;
  name: string;
  score: number;
  travelTimeMinutes: number | null;
  scoreBreakdown: {
    resourceMatch: number;
    travelTime: number;
    freshness: number;
    reliability: number;
  };
  matchedResources: string[];
  status: string;
}

const QUICK_PROMPTS = [
  { label: 'Chest pain & dizziness', icon: '🫀', query: 'I have severe crushing chest pain radiating to my left jaw and dizziness.' },
  { label: 'Face drooping / slurred speech', icon: '🧠', query: 'My family member has sudden facial drooping on one side and slurred speech.' },
  { label: 'Can’t breathe / gasping', icon: '🫁', query: 'I am struggling to breathe, gasping for air and my lips look slightly blue.' },
  { label: 'Heavy spurting cut', icon: '🩸', query: 'Deep wound on arm from broken glass, heavy bleeding will not stop with towel.' },
  { label: 'Mild fever & sore throat', icon: '🌡️', query: 'I have had a mild fever (100°F) and a scratchy sore throat for 2 days.' },
];

type TriageApiResponse = {
  error?: string;
  reply?: string;
  urgency?: ChatMessage['urgency'];
  category?: string | null;
  shouldEscalate?: boolean;
  ranked?: RankedHospitalResult[];
  request?: { id?: string };
  [key: string]: unknown;
};

async function readJsonResponse(response: Response): Promise<TriageApiResponse> {
  const body = await response.text();
  if (!body.trim()) return {};
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(response.ok ? 'The service returned an unexpected response. Please try again.' : `The service could not complete the request (HTTP ${response.status}). Please try again.`);
  }
  try { return JSON.parse(body) as TriageApiResponse; }
  catch { throw new Error('The service returned invalid data. Please try again.'); }
}

const localId = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID()}`;
const timeLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const TriageChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const [escalatedCategory, setEscalatedCategory] = useState<string | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankedHospitals, setRankedHospitals] = useState<RankedHospitalResult[]>([]);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [sosStatus, setSosStatus] = useState<string | null>(null);
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLog, setAuditLog] = useState<Record<string, unknown> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize conversation ID on mount
  useEffect(() => {
    const initial = window.setTimeout(() => {
      setConversationId(localId('triage'));
      setMessages([{ id: 'welcome', role: 'assistant', content: 'Describe your symptoms or what happened. Symptom guidance is informational and is not a diagnosis. If you may be in immediate danger, call your local emergency service now (for example, 112 or 108 in India).', urgency: 'assessing', timestamp: timeLabel() }]);
    }, 0);
    return () => window.clearTimeout(initial);
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, rankedHospitals, isLoading]);

  // Trigger ranking engine when escalated
  const triggerHospitalRanking = async (category: string) => {
    setRankingLoading(true);
    setRankingError(null);
    try {
      if (!navigator.geolocation) throw new Error('Location access is unavailable. Allow GPS to match hospitals near you.');
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 0 }));
      const ambulanceLocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };

      // Existing Phase 1 ranking API call: category becomes emergencyType
      const rankResponse = await fetch('/api/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyType: category,
          ambulanceLocation,
        }),
      });

      const data = await readJsonResponse(rankResponse);
      if (!rankResponse.ok) {
        throw new Error(data.error || 'Failed to retrieve hospital ranking.');
      }

      setRankedHospitals(Array.isArray(data.ranked) ? data.ranked : []);
    } catch (error: unknown) {
      setRankingError(error instanceof Error ? error.message : 'Could not fetch ranked hospitals.');
    } finally {
      setRankingLoading(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || isLoading || isEscalated) return;

    setInputText('');

    const userMsg: ChatMessage = {
      id: localId('msg'),
      role: 'user',
      content: text,
      timestamp: timeLabel(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/triage-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get triage response');
      }
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('The symptom service returned no guidance. Please try again.');

      const botMsg: ChatMessage = {
        id: localId('bot'),
        role: 'assistant',
        content: data.reply,
        urgency: data.urgency,
        category: data.category,
        shouldEscalate: data.shouldEscalate,
        timestamp: timeLabel(),
      };

      setMessages((prev) => [...prev, botMsg]);
      setAuditLog(data);

      // Check for escalation (critical or high urgency)
      if (data.shouldEscalate || data.urgency === 'critical' || data.urgency === 'high') {
        setIsEscalated(true);
        const cat = data.category || 'other';
        setEscalatedCategory(cat);
        void triggerHospitalRanking(cat);
      }
    } catch (error: unknown) {
      const errorMsg: ChatMessage = {
        id: localId('err'),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Could not process the symptom request. If this may be an emergency, contact local emergency services now.',
        urgency: 'assessing',
        timestamp: timeLabel(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSOSDispatch = async () => {
    if (sosSubmitting) return;
    setSosSubmitting(true);
    setSosStatus(null);
    try {
      if (!navigator.geolocation) throw new Error('This browser cannot provide your location. Use the Emergency SOS control on the dashboard from a GPS-enabled device.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
      const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const incident = escalatedCategory ? `Triage Escalation: ${escalatedCategory.replace(/_/g, ' ')}` : 'Emergency Triage Escalation';

      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location,
          incidentType: incident,
          requestType: 'emergency',
        }),
      });

      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to submit SOS');

      setSosStatus(`Ambulance & Hospital request dispatched! Ref: ${data.request?.id || 'Active'}`);
      window.dispatchEvent(new Event('carelink-sos-updated'));
    } catch (error: unknown) {
      setSosStatus(`SOS request failed: ${error instanceof Error ? error.message : 'Could not submit the request.'}`);
    } finally {
      setSosSubmitting(false);
    }
  };

  const handleResetChat = () => {
    const id = localId('triage');
    setConversationId(id);
    setIsEscalated(false);
    setEscalatedCategory(null);
    setRankedHospitals([]);
    setRankingError(null);
    setSosStatus(null);
    setAuditLog(null);
    setMessages([
      {
        id: 'welcome-' + Date.now(),
        role: 'assistant',
        content:
          'Triage reset. Please describe your symptoms. Remember, you can call emergency services directly at any time.',
        urgency: 'assessing',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const getUrgencyBadge = (urgency?: string) => {
    switch (urgency) {
      case 'critical':
        return <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wider animate-pulse">Critical Emergency</span>;
      case 'high':
        return <span className="inline-flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wider">High Urgency</span>;
      case 'moderate':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wider">Moderate</span>;
      case 'low':
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wider">Low / Routine</span>;
      case 'assessing':
      default:
        return <span className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wider">Triage Assessing</span>;
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* PERSISTENT UNMISSABLE EMERGENCY CALL BANNER */}
      <div className="rounded-2xl border-2 border-rose-500 bg-rose-50 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-md shadow-rose-200">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-rose-950">
                Medical Emergency? Call Immediately
              </h2>
              <p className="text-xs text-rose-800">
                If someone is unconscious, bleeding heavily, or having severe chest pain, do not wait for chat.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <a
              href="tel:112"
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-rose-600/30 transition hover:bg-rose-700 active:scale-95"
            >
              <PhoneCall className="h-4 w-4" />
              Call Emergency (112 / 911)
            </a>
            <button
              onClick={handleResetChat}
              title="Reset conversation"
              className="rounded-xl border border-rose-300 bg-white p-2.5 text-rose-700 hover:bg-rose-100 transition"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* CHAT CONTAINER */}
      <div className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[580px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">AI Medical Triage</h1>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                  Phase 1 Engine Connected
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Translates free-text symptoms into urgency &amp; emergency category for immediate hospital ranking.
              </p>
            </div>
          </div>

          {auditLog && (
            <button
              onClick={() => setShowAuditLogs(!showAuditLogs)}
              className="text-xs text-sky-300 hover:text-white underline font-mono flex items-center gap-1"
            >
              <Info className="h-3.5 w-3.5" />
              {showAuditLogs ? 'Hide Audit' : 'Inspect JSON'}
            </button>
          )}
        </div>

        {/* Audit / Evaluation Inspector Dropdown */}
        {showAuditLogs && auditLog && (
          <div className="bg-slate-950 p-4 border-b border-slate-800 text-xs font-mono text-emerald-400 space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-bold">Classification Audit Log</span>
              <span className="text-[11px] text-slate-400">conversationId: {conversationId}</span>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-black/50 p-3 text-[11px] text-slate-200">
              {JSON.stringify(auditLog, null, 2)}
            </pre>
          </div>
        )}

        {/* Message Stream */}
        <div className="flex-1 space-y-4 p-5 overflow-y-auto max-h-[460px] bg-slate-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[11px] font-semibold text-slate-500">
                  {msg.role === 'user' ? 'You' : 'Triage Assistant'}
                </span>
                <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                {msg.urgency && getUrgencyBadge(msg.urgency)}
                {msg.category && (
                  <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 capitalize">
                    {msg.category.replace(/_/g, ' ')}
                  </span>
                )}
              </div>

              <div
                className={`max-w-[85%] sm:max-w-xl rounded-2xl p-4 shadow-xs text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-sky-600 text-white rounded-tr-none'
                    : msg.urgency === 'critical' || msg.urgency === 'high'
                    ? 'bg-rose-50 border border-rose-200 text-rose-950 rounded-tl-none font-medium'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                }`}
              >
                <p className="whitespace-pre-line">{msg.content}</p>

                {/* Persistent emergency action on every bot message */}
                {msg.role === 'assistant' && (
                  <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-500">Need help right now?</span>
                    <a
                      href="tel:112"
                      className="inline-flex items-center gap-1 font-bold text-rose-600 hover:text-rose-700 underline"
                    >
                      <PhoneCall className="h-3 w-3" /> Call 112 / 911
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
              <LoaderCircle className="h-4 w-4 animate-spin text-sky-600" />
              <span>Analyzing symptoms and evaluating emergency criteria…</span>
            </div>
          )}

          {/* ESCALATION PANEL & HOSPITAL RECOMMENDATIONS */}
          {isEscalated && (
            <div className="my-4 rounded-2xl border-2 border-rose-500 bg-white p-5 shadow-lg space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white">
                    <ShieldAlert className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Emergency Escalation Triggered
                    </h3>
                    <p className="text-xs text-slate-500">
                      Category classified as <strong className="text-rose-700 capitalize">{escalatedCategory?.replace(/_/g, ' ')}</strong>.
                      Ranked against nearest hospital resource capacities.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleQuickSOSDispatch}
                    disabled={sosSubmitting}
                    className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-900/30 hover:bg-rose-500 disabled:opacity-70 transition"
                  >
                    {sosSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                    Dispatch SOS Ambulance
                  </button>
                </div>
              </div>

              {sosStatus && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{sosStatus}</span>
                </div>
              )}

              {/* Ranked Hospital Cards */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <span>Recommended Destination Hospitals (Phase 1 Rank Engine)</span>
                  {rankingLoading && <span className="flex items-center gap-1 text-sky-600 font-normal"><LoaderCircle className="h-3 w-3 animate-spin" /> Computing travel matrix…</span>}
                </div>

                {rankingError && (
                  <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                    {rankingError}
                  </p>
                )}

                {rankedHospitals.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {rankedHospitals.map((hosp, idx) => (
                      <div
                        key={hosp.hospitalId || idx}
                        className={`rounded-2xl p-4 border transition-all ${
                          idx === 0
                            ? 'border-emerald-500 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-500/30'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                              idx === 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            #{idx + 1} Best Match
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            Score: {hosp.score}
                          </span>
                        </div>

                        <h4 className="font-bold text-slate-900 text-sm line-clamp-1">{hosp.name}</h4>

                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>ETA: <strong>{hosp.travelTimeMinutes ?? '—'} mins</strong></span>
                        </div>

                        {hosp.matchedResources && hosp.matchedResources.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1">
                            {hosp.matchedResources.map((res, rIdx) => (
                              <span
                                key={rIdx}
                                className="rounded-md bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                              >
                                {res}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : !rankingLoading && (
                  <div className="rounded-xl border border-slate-200 p-4 text-center text-xs text-slate-500">
                    Routing to regional trauma &amp; cardiac dispatch network.
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompt chips (only visible when not escalated) */}
        {!isEscalated && (
          <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              <span>Common emergency tests:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(chip.query)}
                  disabled={isLoading}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-sky-400 hover:text-sky-700 transition shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Input Box or Locked State */}
        <div className="border-t border-slate-200 bg-white p-4">
          {isEscalated ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3.5 flex items-center justify-between text-xs text-rose-950">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-rose-600 shrink-0" />
                <span>
                  <strong>Chat locked for safety:</strong> Symptoms have been escalated to emergency care. Please do not delay.
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetChat}
                className="font-bold text-rose-700 underline hover:text-rose-900 ml-2 shrink-0"
              >
                Start New Triage
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Describe your symptoms in detail (e.g. pain location, onset, breathing)…"
                disabled={isLoading}
                className="flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={isLoading || !inputText.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-md shadow-sky-600/30 hover:bg-sky-500 active:scale-95 disabled:opacity-50 transition"
                aria-label="Send message"
              >
                {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
