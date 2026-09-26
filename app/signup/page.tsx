import Link from 'next/link';
import { Ambulance, ArrowRight, Building2, Heart, Pill } from 'lucide-react';

const roles = [
  { id: 'patient', title: 'Patient', description: 'Request emergency care and stay informed.', icon: Heart, tone: 'rose' },
  { id: 'hospital_staff', title: 'Hospital admin', description: 'Manage hospital capacity and incoming care.', icon: Building2, tone: 'sky' },
  { id: 'driver', title: 'Driver', description: 'Respond to SOS calls and manage assignments.', icon: Ambulance, tone: 'amber' },
  { id: 'pharmacy', title: 'Pharmacy', description: 'Manage medicines and emergency orders.', icon: Pill, tone: 'violet' },
];

export default function SignupRolePage() {
  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-white sm:px-8"><div className="mx-auto max-w-5xl">
    <Link href="/" className="inline-flex items-center gap-2 text-xl font-black"><Heart className="h-6 w-6 fill-rose-500 text-rose-500" />Care<span className="-ml-2 text-rose-400">Link</span></Link>
    <section className="py-14"><p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Get started</p><h1 className="mt-3 text-3xl font-black sm:text-5xl">What brings you to CareLink?</h1><p className="mt-4 max-w-xl text-slate-300">Choose the role you’re creating an account for. We’ll take you to the right sign-up form.</p>
      <div className="mt-9 grid gap-4 sm:grid-cols-2">{roles.map(({ id, title, description, icon: Icon, tone }) => <Link key={id} href={`/signup/${id}`} className="group rounded-2xl border border-white/10 bg-white/[0.06] p-6 transition hover:-translate-y-0.5 hover:border-sky-300/50 hover:bg-white/[0.1]"><span className={`inline-flex rounded-xl p-3 ${tone === 'rose' ? 'bg-rose-500/15 text-rose-300' : tone === 'amber' ? 'bg-amber-400/15 text-amber-200' : tone === 'violet' ? 'bg-violet-400/15 text-violet-200' : 'bg-sky-400/15 text-sky-200'}`}><Icon className="h-6 w-6" /></span><div className="mt-5 flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-white" /></div><p className="mt-2 text-sm text-slate-400">{description}</p></Link>)}</div>
    </section><p className="border-t border-white/10 pt-6 text-sm text-slate-400">Already have an account? <Link href="/signin" className="font-semibold text-sky-300 hover:underline">Sign in</Link></p>
  </div></main>;
}
