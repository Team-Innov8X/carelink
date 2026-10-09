'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, KeyRound, LogOut, Pencil, UserRound, X } from '@/components/icons';
import { authClient } from '../../lib/auth-client';

type ProfileFields = { name?: string; username?: string; phone?: string; hospitalName?: string };

export function ProfileMenu() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<ProfileFields>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  type ProfileUser = NonNullable<typeof session>['user'] & ProfileFields & { role?: string };
  const user = session?.user as ProfileUser | undefined;
  const role = user?.role || 'patient';
  const isHospital = role === 'hospital' || role === 'hospital_staff';
  const displayName = user?.name || user?.email || 'My profile';
  const nameParts = (user?.name || '').trim().split(/\s+/).filter(Boolean);
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : (nameParts[0]?.[0] || 'U').toUpperCase();
  const hospitalName = user?.hospitalName || 'Not provided';

  const showProfile = () => {
    setFields({ name: user?.name || '', username: user?.username || '', phone: user?.phone || '', hospitalName: user?.hospitalName || '' });
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

  const resetPassword = async () => {
    setMessage('');
    if (newPassword.length < 8) { setMessage('Use a new password with at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setMessage('The new passwords do not match.'); return; }
    setPasswordSaving(true);
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword });
      if (result.error) throw new Error(result.error.message || 'Could not reset password.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordOpen(false); setMessage('Password updated.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not reset password.'); }
    finally { setPasswordSaving(false); }
  };

  const signOut = async () => {
    setSigningOut(true); setMessage('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || 'Could not sign out.');
      setOpen(false); router.replace('/signin'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not sign out.'); }
    finally { setSigningOut(false); }
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
      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        {!passwordOpen ? <button type="button" onClick={() => { setPasswordOpen(true); setMessage(''); }} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><KeyRound className="h-4 w-4" />Reset password</button> : <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <div><h3 className="text-sm font-bold text-slate-900">Reset password</h3><p className="mt-1 text-xs text-slate-500">Enter your current password and choose a new one.</p></div>
          <label className="block text-xs font-semibold text-slate-600">Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900" /></label>
          <label className="block text-xs font-semibold text-slate-600">New password<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900" /></label>
          <label className="block text-xs font-semibold text-slate-600">Confirm new password<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900" /></label>
          <div className="flex gap-2"><button type="button" disabled={passwordSaving} onClick={() => { setPasswordOpen(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Cancel</button><button type="button" disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword} onClick={() => void resetPassword()} className="flex-1 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{passwordSaving ? 'Updating…' : 'Update password'}</button></div>
        </div>}
        <button type="button" disabled={signingOut} onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><LogOut className="h-4 w-4" />{signingOut ? 'Signing out…' : 'Log out'}</button>
      </div>
      {message && <p role="status" className="mt-2 text-xs text-slate-600">{message}</p>}
    </section>}
  </div>;
}
