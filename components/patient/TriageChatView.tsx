'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QUICK_START_CHIPS, MAX_MESSAGE_CHARS } from '@/lib/triage/constants';
import { Send } from '../icons';

type Severity = 'self_care' | 'see_doctor' | 'urgent_care' | 'emergency';
type Intent = 'greeting' | 'off_topic' | 'unclear' | 'symptoms';
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: Intent;
  severity?: Severity | null;
  nextSteps?: string[];
  followUpQuestion?: string | null;
  suggestedSpecialty?: string | null;
};

type TriageApiResponse = {
  error?: string;
  intent?: Intent;
  severity?: Severity | null;
  reply?: string;
  nextSteps?: string[];
  followUpQuestion?: string | null;
  suggestedSpecialty?: string | null;
};

const id = () => globalThis.crypto.randomUUID();
const severityLabels: Record<Severity, string> = {
  self_care: 'Self-care',
  see_doctor: 'See a doctor',
  urgent_care: 'Urgent care',
  emergency: 'Emergency',
};

export const TriageChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryText, setRetryText] = useState('');
  const [online, setOnline] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading, error]);

  const lastTriage = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant' && message.severity), [messages]);
  const reportedSymptoms: string[] = [];
  let pendingSymptom = '';
  for (const message of messages) {
    if (message.role === 'user') pendingSymptom = message.content;
    else if (message.intent === 'symptoms' && pendingSymptom) { reportedSymptoms.push(pendingSymptom); pendingSymptom = ''; }
    else pendingSymptom = '';
  }

  const send = async (value = input, retry = false) => {
    const text = value.trim();
    if (!text || loading || !online) return;
    setInput('');
    setError('');
    setRetryText(text);
    if (!retry) setMessages((previous) => [...previous, { id: id(), role: 'user', content: text }]);
    setLoading(true);
    try {
      const priorHistory = retry && messages.at(-1)?.role === 'user' && messages.at(-1)?.content === text ? messages.slice(0, -1) : messages;
      const response = await fetch('/api/triage-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: priorHistory.map(({ role, content, followUpQuestion }) => ({ role, content, followUpQuestion })),
        }),
      });
      const data = await response.json() as TriageApiResponse;
      if (!response.ok) throw new Error(data.error || 'Could not get a response. Please try again.');
      if (!data.reply) throw new Error('The service returned no reply. Please try again.');
      setMessages((previous) => [...previous, {
        id: id(), role: 'assistant', content: data.reply!, intent: data.intent,
        severity: data.intent === 'symptoms' ? data.severity : null,
        nextSteps: data.nextSteps ?? [], followUpQuestion: data.followUpQuestion,
        suggestedSpecialty: data.suggestedSpecialty,
      }]);
      setRetryText('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not get a response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setInput('');
    setError('');
    setRetryText('');
    inputRef.current?.focus();
  };

  return (
    <section className="flex h-[calc(100dvh-8rem)] min-h-0 w-full flex-col overflow-hidden bg-[#F6F8F9] text-[#1B1F23] md:h-[calc(100dvh-4rem)]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold">Symptom triage</h1>
          <p className="text-sm text-slate-600">Describe what you are feeling and when it started.</p>
        </div>
        <button type="button" onClick={reset} className="rounded-md px-3 py-2 text-sm font-medium text-[#1E5A8E] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E5A8E]">New chat</button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="order-2 flex min-h-0 flex-col lg:order-1">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 && (
              <div className="mx-auto mt-8 max-w-2xl rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700">
                <p>Tell me the symptoms, how long you have had them, and anything that makes them better or worse.</p>
                <p className="mt-2 text-slate-600">For severe or rapidly worsening symptoms, seek emergency care.</p>
              </div>
            )}
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((message) => (
                <article key={message.id} className={`max-w-[92%] rounded-xl px-4 py-3 text-sm leading-6 sm:max-w-[85%] ${message.role === 'user' ? 'ml-auto whitespace-pre-wrap bg-[#1E5A8E] text-white' : 'mr-auto border border-slate-200 bg-white text-[#1B1F23]'}`}>
                  {message.severity && <span className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold text-white ${message.severity === 'self_care' ? 'bg-[#2E7D4F]' : message.severity === 'see_doctor' ? 'bg-[#1E5A8E]' : message.severity === 'urgent_care' ? 'bg-[#C98A1F]' : 'bg-[#C0362C]'}`}>{severityLabels[message.severity]}</span>}
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {message.nextSteps && message.nextSteps.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5">{message.nextSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ul>}
                  {message.followUpQuestion && <p className="mt-3 font-medium">{message.followUpQuestion}</p>}
                </article>
              ))}
              {loading && <p className="mr-auto rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600" role="status">Thinking…</p>}
              {!online && <p className="rounded-lg border border-amber-300 bg-white px-4 py-3 text-sm text-slate-700" role="status">You appear to be offline. Reconnect to send your message.</p>}
              {error && <div role="alert" className="mr-auto rounded-lg border border-amber-400 bg-white p-4 text-sm"><p>{error}</p><button type="button" onClick={() => void send(retryText, true)} disabled={!online || loading} className="mt-2 rounded-md bg-[#1E5A8E] px-3 py-2 font-semibold text-white hover:bg-[#17466e] disabled:opacity-50">Retry</button></div>}
              <div ref={endRef} />
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-3 pt-3 sm:px-6">
            {messages.length === 0 && <div className="mx-auto mb-3 flex max-w-3xl flex-wrap gap-2">{QUICK_START_CHIPS.map((chip) => <button key={chip.label} type="button" onClick={() => void send(chip.message)} disabled={loading || !online} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-[#1E5A8E] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E5A8E] disabled:opacity-50">{chip.label}</button>)}</div>}
            <form className="mx-auto flex max-w-3xl items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <label htmlFor="triage-message" className="sr-only">Describe your symptoms</label>
              <textarea id="triage-message" ref={inputRef} rows={2} maxLength={MAX_MESSAGE_CHARS} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} disabled={loading} placeholder="Type your symptoms…" className="min-h-12 max-h-36 flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-[#1B1F23] placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E5A8E] disabled:bg-slate-100" />
              <button type="submit" aria-label="Send message" disabled={loading || !input.trim() || !online} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#1E5A8E] px-4 py-3 text-sm font-semibold text-white hover:bg-[#17466e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1E5A8E] disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /><span>Send</span></button>
            </form>
            <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-slate-600">Guidance only, not a medical diagnosis.</p>
          </div>
        </div>

        <aside className="order-1 border-b border-slate-200 bg-white px-4 py-3 lg:order-2 lg:border-b-0 lg:border-l lg:px-5 lg:py-5" aria-label="Triage summary">
          <h2 className="text-sm font-semibold">Summary</h2>
          {reportedSymptoms.length === 0 ? <p className="mt-2 text-sm leading-5 text-slate-600">Your reported symptoms and next steps will appear here.</p> : <>
            <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Reported symptoms</h3>
            <ul className="mt-1 max-h-28 space-y-1 overflow-auto text-sm text-slate-700">{reportedSymptoms.slice(-8).map((symptom, index) => <li key={`${index}-${symptom}`} className="break-words">{symptom}</li>)}</ul>
            <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-600">Current severity</span>{lastTriage?.severity ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold text-white ${lastTriage.severity === 'self_care' ? 'bg-[#2E7D4F]' : lastTriage.severity === 'see_doctor' ? 'bg-[#1E5A8E]' : lastTriage.severity === 'urgent_care' ? 'bg-[#C98A1F]' : 'bg-[#C0362C]'}`}>{severityLabels[lastTriage.severity]}</span> : <span className="text-sm text-slate-600">Not assessed</span>}</div>
            {lastTriage?.suggestedSpecialty && <p className="mt-3 text-sm text-slate-700"><span className="font-semibold">Suggested specialty:</span> {lastTriage.suggestedSpecialty}</p>}
          </>}
        </aside>
      </div>
    </section>
  );
};
