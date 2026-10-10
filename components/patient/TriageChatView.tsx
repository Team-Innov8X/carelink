'use client';
import React, { useRef, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';

type TriageResult = { is_health_related: boolean; reply: string; urgency: 'critical'|'high'|'moderate'|'low'|'assessing'; category: string|null; follow_up: string|null; shouldEscalate: boolean };
type Message = { id: number; role: 'user'|'assistant'; text: string; result?: TriageResult };
const START = 'Describe the symptoms or injury you would like help with.';
export function TriageChatView() {
  const { setActiveTab } = useCareLink();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, role: 'assistant', text: START }]);
  const [value, setValue] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [summary, setSummary] = useState<TriageResult|null>(null);
  const nextId = useRef(1);
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); const message = value.trim(); if (!message || busy) return;
    setValue(''); setError(''); setMessages(old => [...old, { id: nextId.current++, role: 'user', text: message }]);
    if (message.length < 4) { setMessages(old => [...old, { id: nextId.current++, role: 'assistant', text: 'Please describe the symptoms in a little more detail.' }]); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/triage-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Symptom check is temporarily unavailable. Please try again.');
      const result = data as TriageResult; setSummary(result.is_health_related ? result : null);
      setMessages(old => [...old, { id: nextId.current++, role: 'assistant', text: result.reply, result: result.is_health_related ? result : undefined }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Symptom check is temporarily unavailable. Please try again.'); }
    finally { setBusy(false); }
  };
  const sendSOS = () => { setActiveTab('dashboard'); window.setTimeout(() => document.querySelector<HTMLButtonElement>('[aria-label="Request emergency assistance with SOS"]')?.click(), 0); };
  const tone: Record<string,string> = { critical: 'text-rose-700', high: 'text-rose-700', moderate: 'text-amber-700', low: 'text-emerald-800', assessing: 'text-sky-800' };
  return <main className="mx-auto flex min-h-[calc(100dvh-11rem)] w-full flex-col gap-3">
    <header><h1 className="text-2xl font-bold text-slate-900">Symptom check</h1><p className="text-sm text-slate-600">Guidance only, not a diagnosis.</p></header>
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" aria-label="Symptom conversation">
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">{messages.map(item => <div key={item.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-base leading-relaxed ${item.role === 'user' ? 'ml-auto bg-sky-700 text-white' : 'bg-white text-slate-900 shadow-xs'}`}><p className="whitespace-pre-line">{item.text}</p>{item.result && <p className={`mt-2 font-semibold capitalize ${tone[item.result.urgency]}`}>Urgency: {item.result.urgency}</p>}</div>)}{busy && <p className="text-sm text-slate-600">Checking your message…</p>}</div>
        {summary && <div className="border-t border-slate-200 bg-white p-4 lg:hidden"><Summary result={summary} onHospitals={() => setActiveTab('hospitals')} onDriver={() => setActiveTab('driver-request')} onSOS={sendSOS} /></div>}
        {error && <div role="alert" className="mx-4 mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900">{error}</div>}
        <form onSubmit={send} className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white p-3"><label className="sr-only" htmlFor="triage-message">Describe your symptoms</label><input id="triage-message" value={value} onChange={event => setValue(event.target.value)} maxLength={1000} placeholder="Describe your symptoms" className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-base"/><button type="submit" disabled={busy || !value.trim()} className="rounded-xl bg-sky-700 px-5 text-base font-semibold text-white disabled:opacity-50">Send</button></form>
      </section>
      {summary && <aside className="hidden rounded-2xl border border-slate-200 bg-white p-5 lg:block"><Summary result={summary} onHospitals={() => setActiveTab('hospitals')} onDriver={() => setActiveTab('driver-request')} onSOS={sendSOS} /></aside>}
    </div>
  </main>;
}
function Summary({ result, onHospitals, onDriver, onSOS }: { result: TriageResult; onHospitals: () => void; onDriver: () => void; onSOS: () => void }) {
 const urgency = result.urgency; const tone = urgency === 'critical' || urgency === 'high' ? 'text-rose-700' : urgency === 'moderate' ? 'text-amber-700' : 'text-emerald-800';
 return <><h2 className="text-lg font-bold">Summary</h2><p className={`mt-2 text-base font-semibold capitalize ${tone}`}>● Urgency: {urgency}</p><p className="mt-2 text-base text-slate-800">Likely category: {result.category?.replaceAll('_',' ') || 'Not determined'}</p><div className="mt-4 grid gap-2"><button onClick={onHospitals} className="rounded-lg border border-sky-700 px-3 py-2 text-left text-base font-semibold text-sky-800">Find nearby hospitals</button><button onClick={onDriver} className="rounded-lg border border-sky-700 px-3 py-2 text-left text-base font-semibold text-sky-800">Book a routine driver</button>{(urgency === 'critical' || urgency === 'high') && <button onClick={onSOS} className="rounded-lg bg-rose-700 px-3 py-2 text-left text-base font-semibold text-white">Send SOS</button>}</div></>;
}
