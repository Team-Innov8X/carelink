'use client';

import { useEffect, useState, type ReactNode } from 'react';

function Blocks({ count, className = '' }: { count: number; className?: string }) {
  if (count === 1) return <span aria-hidden="true" className={`carelink-skeleton block rounded-lg ${className}`} />;
  return <div className={className} aria-hidden="true">{Array.from({ length: count }, (_, index) => <span key={index} className="carelink-skeleton block rounded-lg" />)}</div>;
}

export function SignupSkeleton() {
  return <main aria-label="Loading sign up" className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><Blocks count={1} className="mb-6 h-7 w-36" /><Blocks count={1} className="mb-2 h-8 w-64" /><Blocks count={1} className="mb-6 h-4 w-72 max-w-full" /><div className="space-y-4">{Array.from({ length: 6 }, (_, index) => <div key={index}><Blocks count={1} className="mb-1.5 h-3.5 w-28" /><Blocks count={1} className="h-11 w-full" /></div>)}<Blocks count={1} className="mt-2 h-12 w-full" /></div><Blocks count={1} className="my-5 mx-auto h-4 w-12" /><Blocks count={1} className="h-11 w-full" /></div></main>;
}

export function SigninSkeleton() {
  return <main aria-label="Loading sign in" className="flex min-h-screen items-center justify-center bg-slate-100 px-4 pb-8 pt-24 sm:p-8"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-lg sm:p-9"><div className="mb-7 flex items-center gap-3"><Blocks count={1} className="h-10 w-10 rounded-xl" /><Blocks count={1} className="h-6 w-28" /></div><Blocks count={1} className="mb-2 h-8 w-36" /><Blocks count={1} className="mb-6 h-4 w-52" /><div className="space-y-4">{Array.from({ length: 2 }, (_, index) => <div key={index}><Blocks count={1} className="mb-1.5 h-3.5 w-20" /><Blocks count={1} className="h-11 w-full" /></div>)}<Blocks count={1} className="h-12 w-full" /></div><Blocks count={1} className="my-5 mx-auto h-4 w-8" /><Blocks count={1} className="h-11 w-full" /><Blocks count={1} className="mx-auto mt-6 h-4 w-56" /></div></main>;
}

export function DashboardSkeleton() {
  return <main aria-label="Loading dashboard" className="min-h-screen bg-[#F6F8F9]"><div className="flex min-h-screen"><aside className="hidden w-64 border-r border-[#D8DEE2] bg-white p-5 md:block"><Blocks count={1} className="mb-8 h-9 w-36" /><Blocks count={6} className="space-y-3 [&>span]:h-11 [&>span]:w-full" /></aside><div className="flex-1 p-4 sm:p-7"><Blocks count={1} className="mb-2 h-8 w-64" /><Blocks count={1} className="mb-7 h-5 w-96 max-w-full" /><div className="grid gap-4 lg:grid-cols-3"><div className="lg:col-span-2"><Blocks count={1} className="mb-4 h-36 w-full" /><Blocks count={1} className="h-72 w-full" /></div><Blocks count={2} className="space-y-4 [&>span]:h-40 [&>span]:w-full" /></div></div></div></main>;
}

export function HospitalListSkeleton() {
  return <div aria-label="Loading nearby hospitals" aria-busy="true" className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <article key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex justify-between gap-2"><Blocks count={1} className="h-5 w-2/3" /><Blocks count={1} className="h-4 w-12" /></div><Blocks count={1} className="mt-3 h-4 w-1/2" /><Blocks count={1} className="mt-2 h-4 w-3/4" /><Blocks count={1} className="mt-3 h-8 w-32" /></article>)}</div>;
}

export function RequestListSkeleton() {
  return <div aria-label="Loading requests" aria-busy="true" className="space-y-4">{Array.from({ length: 2 }, (_, index) => <article key={index} className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div className="flex-1"><Blocks count={1} className="mb-2 h-4 w-32" /><Blocks count={1} className="h-5 w-56 max-w-full" /></div><Blocks count={1} className="h-7 w-32" /></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Blocks count={1} className="h-24 w-full" /><Blocks count={1} className="h-24 w-full" /></div></article>)}</div>;
}

export function HospitalRequestListSkeleton() {
  return <div aria-label="Loading hospital requests" aria-busy="true" className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="grid grid-cols-7 gap-3 border-b border-slate-200 bg-slate-50 p-3">{Array.from({ length: 7 }, (_, index) => <Blocks key={index} count={1} className="h-3 w-full" />)}</div>{Array.from({ length: 4 }, (_, row) => <div key={row} className="grid grid-cols-7 gap-3 border-b border-slate-100 p-3 last:border-0">{Array.from({ length: 7 }, (_, index) => <Blocks key={index} count={1} className="h-5 w-full" />)}</div>)}</div>;
}

export function DelayedSkeleton({ children, delayMs = 150 }: { children: ReactNode; delayMs?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  return visible ? children : null;
}
