'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { Send, Siren } from '../icons';

type TriageResult = {
  relevant: boolean;
  reply: string;
  urgency: 'critical' | 'high' | 'moderate' | 'low' | 'assessing';
  category: 'cardiac' | 'trauma' | 'respiratory' | 'stroke' | 'bleeding' | 'allergic' | 'burns' | 'other' | null;
  suggestions: string[];
  shouldEscalate: boolean;
};
type Message = { id: number; role: 'user' | 'assistant'; text: string };

const START = 'What symptoms are you having?';
const ERROR_TEXT = "We couldn't check that right now. If this is an emergency, use the SOS button.";

export function TriageChatView() {
  const { setActiveTab } = useCareLink();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, role: 'assistant', text: START }]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [summary, setSummary] = useState<TriageResult | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const nextId = useRef(1);
  const conversationEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { conversationEnd.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);

  const openSos = () => {
    setActiveTab('dashboard');
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('[aria-label="Request emergency assistance with SOS"]')?.click(), 0);
  };

  const openHospitals = () => {
    if (summary?.category) sessionStorage.setItem('carelink_triage_category', summary.category);
    setActiveTab('hospitals');
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = value.trim();
    if (!message || busy) return;
    setValue('');
    setHasError(false);
    setMessages((old) => [...old, { id: nextId.current++, role: 'user', text: message }]);
    setBusy(true);
    try {
      const response = await fetch('/api/triage-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, ...(conversationId.current ? { conversationId: conversationId.current } : {}) }),
      });
      if (!response.ok) throw new Error('TRIAGE_UNAVAILABLE');
      const result = await response.json() as TriageResult;
      conversationId.current = response.headers.get('X-CareLink-Conversation-Id') || conversationId.current;
      setSummary(result.relevant ? result : null);
      setMessages((old) => [...old, { id: nextId.current++, role: 'assistant', text: result.reply }]);
    } catch {
      setHasError(true);
      setSummary(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex h-[calc(100dvh-10rem)] min-h-[34rem] w-full flex-col gap-3" aria-labelledby="symptom-check-title">
      <header className="shrink-0">
        <h1 id="symptom-check-title" className="text-2xl font-bold text-slate-900">Symptom check</h1>
        <p className="text-sm text-slate-600">Guidance only, not a diagnosis.</p>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Symptom conversation">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4" aria-live="polite" aria-relevant="additions text">
            {messages.map((item) => (
              <div key={item.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-base leading-relaxed ${item.role === 'user' ? 'ml-auto bg-sky-800 text-white' : 'bg-white text-slate-900 shadow-xs'}`}>
                <p className="whitespace-pre-line">{item.text}</p>
              </div>
            ))}
            {busy && <p role="status" className="text-sm text-slate-700">Checking your message…</p>}
            <div ref={conversationEnd} />
          </div>

          {summary && <div className="border-t border-slate-200 bg-white p-4 lg:hidden"><Summary result={summary} onHospitals={openHospitals} onDriver={() => setActiveTab('driver-request')} onSOS={openSos} /></div>}

          {hasError && (
            <div role="alert" className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900">
              <p>{ERROR_TEXT}</p>
              <button type="button" onClick={openSos} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 font-semibold text-white hover:bg-rose-800"><Siren className="h-4 w-4" />SOS</button>
            </div>
          )}

          <form onSubmit={send} className="sticky bottom-0 flex shrink-0 gap-2 border-t border-slate-200 bg-white p-3">
            <label className="sr-only" htmlFor="triage-message">Describe your symptoms</label>
            <textarea id="triage-message" value={value} onChange={(event) => setValue(event.target.value)} maxLength={500} rows={1} placeholder="Describe your symptoms" className="min-h-12 min-w-0 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-3 text-base leading-6 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-200" />
            <button type="submit" disabled={busy || !value.trim()} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky-800 px-4 text-base font-semibold text-white hover:bg-sky-900 disabled:opacity-50"><Send className="h-4 w-4" />Send</button>
          </form>
        </section>

        <aside className="hidden min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 lg:block" aria-label="Symptom summary">
          {summary ? <Summary result={summary} onHospitals={openHospitals} onDriver={() => setActiveTab('driver-request')} onSOS={openSos} /> : <><h2 className="text-lg font-bold text-slate-900">Summary</h2><p className="mt-2 text-sm text-slate-600">A summary appears after a health concern is checked.</p></>}
        </aside>
      </div>
    </main>
  );
}

function Summary({ result, onHospitals, onDriver, onSOS }: { result: TriageResult; onHospitals: () => void; onDriver: () => void; onSOS: () => void }) {
  if (!result.relevant) return null;
  const urgencyStyle: Record<TriageResult['urgency'], { color: string; shape: string; label: string }> = {
    critical: { color: 'text-rose-800', shape: '◆', label: 'Critical' },
    high: { color: 'text-rose-800', shape: '▲', label: 'High' },
    moderate: { color: 'text-amber-800', shape: '■', label: 'Moderate' },
    low: { color: 'text-emerald-800', shape: '●', label: 'Low' },
    assessing: { color: 'text-slate-700', shape: '○', label: 'Assessing' },
  };
  const urgency = urgencyStyle[result.urgency];
  const actions: Record<string, () => void> = {
    'Find nearby hospitals': onHospitals,
    'Book a routine driver': onDriver,
    'Send SOS': onSOS,
  };

  return (
    <>
      <h2 className="text-lg font-bold text-slate-900">Summary</h2>
      <p className={`mt-3 flex items-center gap-2 text-base font-bold ${urgency.color}`}><span aria-hidden="true" className="text-xl">{urgency.shape}</span><span>Urgency: {urgency.label}</span></p>
      <p className="mt-2 text-base text-slate-800">Likely category: <span className="font-semibold">{result.category?.replaceAll('_', ' ') || 'Not determined'}</span></p>
      {result.suggestions.length > 0 && <div className="mt-4 grid gap-2"><h3 className="text-sm font-semibold text-slate-700">Suggested actions</h3>{result.suggestions.slice(0, 3).map((action) => actions[action] ? <button key={action} type="button" onClick={actions[action]} className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-semibold ${action === 'Send SOS' ? 'border-rose-700 bg-rose-700 text-white hover:bg-rose-800' : 'border-sky-800 text-sky-900 hover:bg-sky-50'}`}>{action}</button> : <p key={action} className="text-sm text-slate-700">{action}</p>)}</div>}
    </>
  );
}
