import Link from 'next/link';
import { Activity, ArrowRight, Heart, ShieldCheck } from '@/components/icons';
import FeatureCarousel from './feature-carousel';
import NetworkStatistics from '@/components/marketing/NetworkStatistics';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#fbfcfd] text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-7 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="CareLink home">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-200"><Heart className="h-6 w-6 fill-white" /></span>
            <span className="text-2xl font-black tracking-tight">Care<span className="text-rose-600">Link</span></span>
          </Link>
          <Link href="/signin" className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-rose-200 hover:text-rose-700">Sign in</Link>
        </header>

        <section className="grid items-center gap-12 py-14 lg:grid-cols-[.9fr_1.1fr] lg:py-20">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3.5 py-2 text-xs font-semibold tracking-wide text-sky-800"><Activity className="h-4 w-4" /> A connected network for better care</div>
            <h1 className="max-w-2xl text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">When every moment matters, <span className="text-rose-600">care connects.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Patients, hospitals, emergency teams, drivers, and pharmacies working together to move the right help faster.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700">Create an account <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/signin" className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Sign in to CareLink</Link>
            </div>
            <div className="mt-8 flex items-center gap-3 text-sm text-slate-500"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Care coordination, built around people.</div>
          </div>
          <FeatureCarousel />
        </section>

        <NetworkStatistics />

        <footer className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-slate-200 py-7 text-sm text-slate-500 sm:flex-row sm:items-center"><p>CareLink · Faster Care, Healthier Tomorrow</p><div className="flex gap-5"><Link className="hover:text-rose-700" href="/signin">Sign in</Link><Link className="hover:text-rose-700" href="/signup">Create account</Link></div></footer>
      </div>
    </main>
  );
}
