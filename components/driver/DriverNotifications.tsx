'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, X } from '@/components/icons';
import { readApiResponse } from './readApiResponse';

type DriverNotification = {
  _id: string;
  type: string;
  title: string;
  message: string;
  relatedRequestId: string;
  createdAt: string;
  readAt?: string | null;
};

export function DriverNotifications() {
  const [items, setItems] = useState<DriverNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      const result = await readApiResponse(response);
      if (response.status === 401) { window.location.assign('/signin'); return; }
      if (!response.ok) throw new Error(result.error || 'Could not load notifications.');
      setItems(result.notifications ?? []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load notifications.');
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  const markRead = async (id: string) => {
    const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: 'PATCH' });
    if (!response.ok) { setError('Could not mark this notification as read.'); return; }
    setItems((current) => current.map((item) => item._id === id ? { ...item, readAt: new Date().toISOString() } : item));
  };

  const markAllRead = async () => {
    const response = await fetch('/api/notifications/read-all', { method: 'PATCH' });
    if (!response.ok) { setError('Could not mark all notifications as read.'); return; }
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
  };

  const unread = items.filter((item) => !item.readAt).length;
  return <div className="relative">
    <button type="button" aria-label={`Driver notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100">
      <Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section aria-label="Driver notifications" className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl">
      <header className="mb-3 flex items-center justify-between gap-2"><div><h2 className="font-bold">Notifications</h2><p className="text-xs text-slate-500">{unread} unread · newest first</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => void markAllRead()} disabled={!unread} aria-label="Mark all as read" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><CheckCheck className="h-4 w-4" /></button><button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X className="h-4 w-4" /></button></div></header>
      {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
      <div className="max-h-[60vh] space-y-2 overflow-y-auto">{items.length ? items.slice(0, 20).map((item) => <article key={item._id} className={`rounded-lg border p-3 ${item.readAt ? 'border-slate-200 bg-white' : 'border-sky-200 bg-sky-50/70'}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p><p className="mt-1 text-[10px] text-slate-500">{item.type.replaceAll('_', ' ')} · {new Date(item.createdAt).toLocaleString()}</p></div>{!item.readAt && <button type="button" onClick={() => void markRead(item._id)} aria-label="Mark notification as read" className="shrink-0 rounded-md p-1.5 text-sky-800 hover:bg-white"><Check className="h-4 w-4" /></button>}</div></article>) : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No notifications yet.</p>}</div>
    </section>}
  </div>;
}
