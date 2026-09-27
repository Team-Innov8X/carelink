import Link from 'next/link';
import { Activity, ArrowRight, Building2, Heart, Pill, Siren } from 'lucide-react';

const services = [
  { icon: Siren, title: 'Emergency response', detail: 'Coordinate urgent requests and ambulance dispatch in real time.' },
  { icon: Building2, title: 'Connected hospitals', detail: 'Find facilities and share availability across the care network.' },
  { icon: Pill, title: 'Care beyond the hospital', detail: 'Connect patients with pharmacies, medicines, and follow-up support.' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(14,165,233,0.2),_transparent_45%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-7 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="CareLink home">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 shadow-lg shadow-rose-950/40"><Heart className="h-6 w-6 fill-white" /></span>
            <span className="text-2xl font-black tracking-tight">Care<span className="text-rose-400">Link</span></span>
          </Link>
          <Link href="/signin" className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10">Sign in</Link>
        </header>

        <section className="grid items-center gap-14 pb-20 pt-20 lg:grid-cols-[1.1fr_.9fr] lg:pb-28 lg:pt-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3.5 py-2 text-xs font-semibold tracking-wide text-sky-200"><Activity className="h-4 w-4" /> A connected network for better care</div>
            <h1 className="max-w-2xl text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">When every moment matters, <span className="text-rose-400">care connects.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">CareLink brings patients, hospitals, emergency teams, drivers, and pharmacies together so the right help can move faster.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-3.5 text-sm font-bold shadow-lg shadow-rose-950/40 transition hover:bg-rose-500">Create an account <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/signin" className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10">Sign in to CareLink</Link>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-8 rounded-full bg-sky-500/10 blur-3xl" />
            <div className="relative rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur sm:p-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Care, coordinated</p><h2 className="mt-1 text-xl font-bold">One network. Every step.</h2></div><span className="rounded-xl bg-rose-500/15 p-3 text-rose-300"><Heart className="h-6 w-6" /></span></div>
              <div className="mt-6 space-y-4">
                {['A patient needs urgent care', 'Nearby teams and hospitals connect', 'Care continues through recovery'].map((step, index) => <div key={step} className="flex items-center gap-4 rounded-2xl bg-slate-900/70 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sm font-bold text-sky-200">0{index + 1}</span><p className="text-sm font-medium text-slate-200">{step}</p></div>)}
              </div>
              <p className="mt-6 text-sm leading-6 text-slate-400">Faster Care, Healthier Tomorrow</p>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 py-12 sm:py-16">
          <div className="mb-7 max-w-xl"><p className="text-sm font-bold uppercase tracking-[0.18em] text-rose-300">What CareLink does</p><h2 className="mt-2 text-3xl font-bold tracking-tight">A clearer path to care</h2></div>
          <div className="grid gap-4 md:grid-cols-3">{services.map(({ icon: Icon, title, detail }) => <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><span className="mb-5 inline-flex rounded-xl bg-sky-400/10 p-3 text-sky-200"><Icon className="h-5 w-5" /></span><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p></article>)}</div>
        </section>
        <footer className="flex flex-col items-start justify-between gap-4 border-t border-white/10 py-7 text-sm text-slate-400 sm:flex-row sm:items-center"><p>CareLink · Faster Care, Healthier Tomorrow</p><div className="flex gap-5"><Link className="hover:text-white" href="/signin">Sign in</Link><Link className="hover:text-white" href="/signup">Sign up</Link></div></footer>
      </div>
    </main>
  );
}
