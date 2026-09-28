import React from 'react';
import { Clock3, HeartHandshake } from 'lucide-react';

export const PatientHandoffView: React.FC = () => (
  <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-sky-100 bg-white p-10 text-center shadow-sm">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><HeartHandshake className="h-7 w-7" /></div>
    <h1 className="text-2xl font-black text-slate-900">Patient handoff</h1>
    <p className="mt-2 text-sm text-slate-500">This feature is coming soon.</p>
    <Clock3 className="mx-auto mt-5 h-4 w-4 text-slate-400" aria-hidden="true" />
  </section>
);
