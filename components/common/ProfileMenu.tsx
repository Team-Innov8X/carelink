'use client';

import { useState } from 'react';
import { Check, Pencil, UserRound, X, KeyRound } from 'lucide-react';
import { authClient } from '../../lib/auth-client';
import { useCareLink } from '../../context/CareLinkContext';

type ProfileFields = { name?: string; username?: string; phone?: string; hospitalName?: string };

export function ProfileMenu() {
  const { data: session } = authClient.useSession();
  const { hospitals } = useCareLink();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<ProfileFields>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  type ProfileUser = NonNullable<typeof session>['user'] & ProfileFields & { role?: string };
  const user = session?.user as ProfileUser | undefined;
  const role = user?.role || 'patient';
  const isHospital = role === 'hospital' || role === 'hospital_staff';
  const displayName = user?.name || user?.email || 'My profile';
  const initials = displayName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'U';
  const hospitalName = user?.hospitalName || hospitals[0]?.name || 'Not provided';

  const showProfile = () => {
    setFields({ name: user?.name || '', username: user?.username || '', phone: user?.phone || '', hospitalName: user?.hospitalName || hospitals[0]?.name || '' });
    setEditing(false);
    setMessage('');
    setOpen((value) => !value);
  };
  const save = async () => {
    if (!fields.name?.trim() || !fields.username?.trim() || !fields.phone?.trim()) return;
    setSaving(true);
    try {
      const updateUser = authClient.updateUser as (data: ProfileFields) => Promise<{ error?: { message?: string } | null }>;
      const result = await updateUser({ ...fields, name: fields.name.trim(), username: fields.username.trim(), phone: fields.phone.trim(), ...(isHospital ? { hospitalName: fields.hospitalName?.trim() } : {}) });
      setMessage(result.error ? result.error.message || 'Could not update profile.' : 'Profile updated.');
      if (!result.error) setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="relative">
    <button type="button" onClick={showProfile} aria-expanded={open} aria-label={`View profile for ${displayName}`} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-left hover:border-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-sky-700 text-xs font-bold text-white">{user?.image ? <img src={user.image} alt="" className="h-full w-full object-cover" /> : initials || <UserRound className="h-4 w-4" />}</span>
      <span className="max-w-36"><span className="block truncate text-sm font-semibold text-slate-800">{displayName}</span><span className="block text-[11px] text-slate-500">View profile</span></span>
    </button>
    {open && <section className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl" aria-label="Profile details">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Profile details</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close profile"><X className="h-4 w-4" /></button></div>
      {editing ? <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-600">Name<input value={fields.name || ''} onChange={(event) => setFields((old) => ({ ...old, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-500" /></label>
        <label className="block text-xs font-semibold text-slate-600">Phone number<input type="tel" value={fields.phone || ''} onChange={(event) => setFields((old) => ({ ...old, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-500" /></label>
        <label className="block text-xs font-semibold text-slate-600">Username<input value={fields.username || ''} onChange={(event) => setFields((old) => ({ ...old, username: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-500" /></label>
        {isHospital && <label className="block text-xs font-semibold text-slate-600">Hospital name<input value={fields.hospitalName || ''} onChange={(event) => setFields((old) => ({ ...old, hospitalName: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-500" /></label>}
        <p className="text-xs text-slate-500">Email · {user?.email || 'Not provided'}</p>
        <div className="flex gap-2"><button type="button" onClick={() => setEditing(false)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="button" disabled={saving || !fields.name?.trim() || !fields.username?.trim() || !fields.phone?.trim()} onClick={save} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Saving…' : 'Save details'}</button></div>
      </div> : <>
        <dl className="divide-y divide-slate-100">{[
          ['Name', user?.name || 'Not provided'], ['Phone number', user?.phone || 'Not provided'], ['Username', user?.username ? `@${user.username}` : 'Not provided'], ...(isHospital ? [['Hospital name', hospitalName]] : []), ['Email', user?.email || 'Not provided'],
        ].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-2.5 text-sm"><dt className="text-slate-500">{label}</dt><dd className="max-w-56 break-words text-right font-medium text-slate-800">{value}</dd></div>)}</dl>
        <button type="button" onClick={() => { setEditing(true); setMessage(''); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white"><Pencil className="h-4 w-4" />Edit details</button>
      </>}
      <a href="/forgot-password" className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><KeyRound className="h-4 w-4" />Reset password</a>
      {message && <p role="status" className="mt-2 text-xs text-slate-600">{message}</p>}
    </section>}
  </div>;
}
