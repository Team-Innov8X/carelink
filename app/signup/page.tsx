import Link from 'next/link';
import { Ambulance, ArrowRight, Building2, Heart, Pill } from '@/components/icons';

const roles = [
  { id: 'patient', title: 'Patient', description: 'Request emergency care and stay informed.', icon: Heart, tone: 'rose' },
  { id: 'hospital_staff', title: 'Hospital admin', description: 'Manage hospital capacity and incoming care.', icon: Building2, tone: 'sky' },
  { id: 'driver', title: 'Driver', description: 'Respond to SOS calls and manage assignments.', icon: Ambulance, tone: 'amber' },
  { id: 'pharmacy', title: 'Pharmacy', description: 'Manage medicines and emergency orders.', icon: Pill, tone: 'violet' },
];

export default function SignupRolePage() {
  return <main className="min-h-screen bg-[#fbfcfd] px-5 py-10 text-slate-900 sm:px-8"><div className="mx-auto max-w-5xl">
    <Link href="/" className="inline-flex items-center gap-2 text-xl font-black"><Heart className="h-6 w-6 fill-rose-600 text-rose-600" />Care<span className="-ml-2 text-rose-600">Link</span></Link>
    <section className="py-14"><p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Get started</p><h1 className="mt-3 text-3xl font-black sm:text-5xl">What brings you to CareLink?</h1><p className="mt-4 max-w-xl text-slate-600">Choose the role you’re creating an account for. We’ll take you to the right sign-up form.</p>
      <div className="mt-9 grid gap-4 sm:grid-cols-2">{roles.map(({ id, title, description, icon: Icon, tone }) => <Link key={id} href={`/signup/${id}`} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"><span className={`inline-flex rounded-xl p-3 ${tone === 'rose' ? 'bg-rose-50 text-rose-600' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'violet' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}><Icon className="h-6 w-6" /></span><div className="mt-5 flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-700" /></div><p className="mt-2 text-sm text-slate-500">{description}</p></Link>)}</div>
    </section><p className="border-t border-slate-200 pt-6 text-sm text-slate-500">Already have an account? <Link href="/signin" className="font-semibold text-sky-700 hover:underline">Sign in</Link></p>
  </div></main>;
}
