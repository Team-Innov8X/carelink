'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  fallback?: boolean;
};

type TriageApiResponse = {
  error?: string;
  intent?: Intent;
  severity?: Severity | null;
  reply?: string;
  nextSteps?: string[];
  followUpQuestion?: string | null;
  fallback?: boolean;
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
        fallback: data.fallback,
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
    <section className="flex h-[calc(100dvh-8rem)] min-h-0 w-full flex-col overflow-hidden bg-slate-50 text-slate-900 md:h-[calc(100dvh-4rem)]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold">Symptom triage</h1>
          <p className="text-sm text-slate-600">Describe what you are feeling and when it started.</p>
        </div>
        <button type="button" onClick={reset} className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">New chat</button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 && (
              <article className="mx-auto mt-8 w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700 shadow-sm">
                <p className="font-semibold text-slate-900">Hi, how may I help you today?</p>
                <p className="mt-2">Tell me what symptoms you are experiencing, when they started, and anything that makes them better or worse.</p>
                <p className="mt-2 text-slate-600">For severe or rapidly worsening symptoms, seek emergency care.</p>
              </article>
            )}
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
              {messages.map((message) => (
                <article key={message.id} className={`max-w-[92%] rounded-xl px-4 py-3 text-sm leading-6 sm:max-w-[85%] ${message.role === 'user' ? 'ml-auto whitespace-pre-wrap bg-[var(--primary)] text-white' : 'mr-auto border border-slate-200 bg-white text-slate-800 shadow-sm'}`}>
                  {message.severity && <span className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold text-white ${message.severity === 'self_care' ? 'bg-[var(--success)]' : message.severity === 'see_doctor' ? 'bg-[var(--primary)]' : message.severity === 'urgent_care' ? 'bg-[var(--warning)]' : 'bg-[var(--emergency)]'}`}>{severityLabels[message.severity]}</span>}
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {message.nextSteps && message.nextSteps.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5">{message.nextSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ul>}
                  {message.followUpQuestion && <p className="mt-3 font-medium">{message.followUpQuestion}</p>}
                  {message.fallback && <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-600">Basic guidance shown because the AI assessment service is unavailable.</p>}
                </article>
              ))}
              {loading && <div className="mr-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm" role="status" aria-label="Thinking">
                <p className="mb-3 text-sm font-medium text-slate-600">Thinking…</p>
                <div className="space-y-2 animate-pulse motion-reduce:animate-none" aria-hidden="true">
                  <div className="h-3 w-4/5 rounded bg-slate-200" />
                  <div className="h-3 w-full rounded bg-slate-200" />
                  <div className="h-3 w-2/3 rounded bg-slate-200" />
                </div>
              </div>}
              {!online && <p className="rounded-lg border border-amber-300 bg-white px-4 py-3 text-sm text-slate-700" role="status">You appear to be offline. Reconnect to send your message.</p>}
              {error && <div role="alert" className="mr-auto rounded-lg border border-amber-300 bg-white p-4 text-sm text-slate-800"><p>{error}</p><button type="button" onClick={() => void send(retryText, true)} disabled={!online || loading} className="mt-2 rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50">Try again</button></div>}
              <div ref={endRef} />
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-3 pt-3 sm:px-6">
            {messages.length === 0 && <div className="mx-auto mb-3 flex max-w-5xl flex-wrap gap-2">{QUICK_START_CHIPS.map((chip) => <button key={chip.label} type="button" onClick={() => void send(chip.message)} disabled={loading || !online} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50">{chip.label}</button>)}</div>}
            <form className="mx-auto flex w-full max-w-5xl items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <label htmlFor="triage-message" className="sr-only">Describe your symptoms</label>
              <textarea id="triage-message" ref={inputRef} rows={2} maxLength={MAX_MESSAGE_CHARS} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} disabled={loading} placeholder="Describe your symptoms…" className="min-h-12 max-h-36 flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:bg-slate-100" />
              <button type="submit" aria-label="Send message" disabled={loading || !input.trim() || !online} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /><span>Send</span></button>
            </form>
            <p className="mx-auto mt-2 max-w-5xl text-center text-xs text-slate-500">Guidance only, not a medical diagnosis.</p>
          </div>
      </div>
    </section>
  );
};
