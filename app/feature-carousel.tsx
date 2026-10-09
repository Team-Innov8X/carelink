'use client';

import { useEffect, useState } from 'react';
import { Ambulance, ArrowDown, ArrowRight, Building2, Clock3, HeartPulse, MapPin, Pill, Radio } from '@/components/icons';

const features = [
  { title: 'Emergency ambulance response', detail: 'Connect an SOS request with nearby response teams.', icon: Ambulance, tag: 'LIVE RESPONSE', kind: 'map' },
  { title: 'Connected hospital care', detail: 'Help teams coordinate availability and incoming patients.', icon: Building2, tag: 'HOSPITAL NETWORK', kind: 'hospital' },
  { title: 'Pharmacy support', detail: 'Keep medicine access connected to the care journey.', icon: Pill, tag: 'CONTINUED CARE', kind: 'pharmacy' },
];

function MapPreview() {
  return <div className="relative h-[290px] overflow-hidden rounded-2xl border border-slate-200 bg-[#eaf3ee] sm:h-[330px]" aria-label="Illustration of a patient and ambulance connected by a route">
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="600" height="360" fill="#edf5ef" />
      <path d="M-20 92 150 112 224 67 360 98 460 49 630 74M-20 267 115 238 211 284 337 230 455 267 630 208M96-20 130 84 94 185 150 380M355-20 329 78 374 168 344 260 370 380M500-20 472 82 526 164 482 267 520 380" stroke="#d1e2d7" strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d="M-20 92 150 112 224 67 360 98 460 49 630 74M-20 267 115 238 211 284 337 230 455 267 630 208M96-20 130 84 94 185 150 380M355-20 329 78 374 168 344 260 370 380M500-20 472 82 526 164 482 267 520 380" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M144 241 C191 215 193 147 266 144 S365 174 435 100" stroke="#fff" strokeWidth="13" fill="none" strokeLinecap="round" />
      <path d="M144 241 C191 215 193 147 266 144 S365 174 435 100" stroke="#e11d48" strokeWidth="5" strokeDasharray="1 0" fill="none" strokeLinecap="round" />
      <circle cx="144" cy="241" r="20" fill="#e11d48" stroke="white" strokeWidth="6" /><circle cx="435" cy="100" r="20" fill="#0284c7" stroke="white" strokeWidth="6" />
      <circle cx="144" cy="241" r="5" fill="white" /><path d="M435 91v18m-9-9h18" stroke="white" strokeWidth="4" strokeLinecap="round" />
    </svg>
    <div className="absolute left-4 top-4 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm"><Radio className="h-4 w-4 text-rose-600" /> Nearest team dispatched</div>
    <div className="absolute bottom-4 left-4 rounded-xl bg-white/95 px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Patient location</p><p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-700"><MapPin className="h-3.5 w-3.5 text-rose-600" /> SOS request</p></div>
    <div className="absolute right-4 top-20 rounded-xl bg-white/95 px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ambulance</p><p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-700"><Ambulance className="h-3.5 w-3.5 text-sky-600" /> En route</p></div>
  </div>;
}

export default function FeatureCarousel() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % features.length), 5500);
    return () => window.clearInterval(timer);
  }, []);
  const feature = features[active];
  const Icon = feature.icon;
  return <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_-35px_rgba(15,23,42,.28)] sm:p-6" aria-label="CareLink features">
    <div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold tracking-[0.18em] text-rose-600">{feature.tag}</p><h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{feature.title}</h2><p className="mt-1 text-sm text-slate-500">{feature.detail}</p></div><span className="rounded-2xl bg-rose-50 p-3 text-rose-600"><Icon className="h-6 w-6" /></span></div>
    {active === 0 ? <MapPreview /> : <div className="relative flex h-[290px] flex-col justify-center overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-7 sm:h-[330px]"><div className="absolute -right-6 -top-8 h-44 w-44 rounded-full bg-sky-100/70" /><div className="relative mx-auto w-full max-w-sm space-y-3">{(active === 1 ? [{ icon: Building2, name: 'City Care Hospital', status: 'Capacity shared' }, { icon: HeartPulse, name: 'Patient handoff', status: 'Care team connected' }, { icon: Clock3, name: 'Arrival update', status: 'Coordination in progress' }] : [{ icon: Pill, name: 'Medicine request', status: 'Order received' }, { icon: Building2, name: 'Care network', status: 'Pharmacy connected' }, { icon: ArrowRight, name: 'Next step', status: 'Support continues' }]).map(({ icon: RowIcon, name, status }) => <div key={name} className="flex items-center gap-4 rounded-2xl border border-white bg-white/90 p-4 shadow-sm"><span className="rounded-xl bg-sky-50 p-3 text-sky-700"><RowIcon className="h-5 w-5" /></span><div className="flex-1"><p className="font-bold text-slate-800">{name}</p><p className="mt-1 text-xs text-slate-500">{status}</p></div><ArrowDown className="h-4 w-4 text-slate-300" /></div>)}</div></div>}
    <div className="mt-4 flex items-center justify-between"><div className="flex gap-2" role="tablist" aria-label="Feature slides">{features.map((item, index) => <button key={item.title} type="button" role="tab" aria-selected={index === active} aria-label={`Show ${item.title}`} onClick={() => setActive(index)} className={`h-2 rounded-full transition-all ${index === active ? 'w-8 bg-rose-600' : 'w-2 bg-slate-300 hover:bg-slate-400'}`} />)}</div><p className="text-xs font-semibold text-slate-400">0{active + 1} <span className="mx-1">/</span> 0{features.length}</p></div>
  </section>;
}
