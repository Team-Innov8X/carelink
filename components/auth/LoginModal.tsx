'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, LogIn, X } from 'lucide-react';
import { routeForRole } from '../../lib/role-route';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const accountTypes = [
  ['patient', 'Patient'],
  ['hospital_staff', 'Hospital staff'],
  ['pharmacy', 'Pharmacy / pharmaceuticals'],
  ['driver', 'Driver'],
];

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const [accountType, setAccountType] = useState('patient');
  if (!isOpen) return null;

  const openWorkspace = () => {
    onClose();
    router.push(routeForRole(accountType));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section className="relative grid w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl md:grid-cols-2">
        <button type="button" onClick={onClose} aria-label="Close sign in" className="absolute right-3 top-3 z-10 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        <aside className="flex flex-col justify-center bg-gradient-to-br from-slate-900 to-sky-950 p-8 text-white">
          <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-rose-600 p-2.5"><Heart className="h-5 w-5 fill-current" /></span><span className="text-2xl font-black">Care<span className="text-rose-400">Link</span></span></div>
          <h2 className="text-2xl font-bold">Care, connected.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">Choose a role to open the matching CareLink workspace.</p>
        </aside>
        <div className="flex flex-col justify-center p-8 lg:p-10">
          <h1 className="text-2xl font-bold text-slate-900">Welcome</h1>
          <p className="mt-1 text-sm text-slate-500">Select your role to continue.</p>
          <label htmlFor="modal-account-type" className="mt-6 block text-xs font-semibold uppercase tracking-wide text-slate-700">Continue as</label>
          <select id="modal-account-type" value={accountType} onChange={(event) => setAccountType(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
            {accountTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" onClick={openWorkspace} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 py-3 text-sm font-semibold text-white hover:bg-sky-600"><LogIn className="h-4 w-4" /> Open workspace</button>
          <p className="mt-6 text-center text-sm text-slate-500">New to CareLink? <Link href="/signup" onClick={onClose} className="font-semibold text-sky-700 hover:underline">Create an account</Link></p>
        </div>
      </section>
    </div>
  );
};
