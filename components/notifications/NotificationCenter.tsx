'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, RefreshCw } from 'lucide-react';

type CareNotification = {
  _id: string;
  type: string;
  title: string;
  message: string;
  relatedRequestId: string;
  readAt?: string | null;
  createdAt: string;
};

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<CareNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load notifications.');
      setNotifications(result.notifications ?? []);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [refresh]);

  const markRead = async (notificationId: string) => {
    const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}`, { method: 'PATCH' });
    if (!response.ok) {
      setMessage('Could not mark this notification as read.');
      return;
    }
    setNotifications((items) => items.map((item) => item._id === notificationId ? { ...item, readAt: new Date().toISOString() } : item));
  };

  return <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="mb-5 flex items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Bell className="h-5 w-5 text-sky-700" />Notifications</h1><p className="mt-1 text-sm text-slate-500">Updates about your emergency and hospital response.</p></div><button type="button" onClick={() => void refresh()} aria-label="Refresh notifications" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button></div>
    {message && <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</p>}
    {loading ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Loading notifications…</p> : notifications.length ? <div className="space-y-3">{notifications.map((notification) => <article key={notification._id} className={`rounded-xl border p-4 ${notification.readAt ? 'border-slate-200 bg-white' : 'border-sky-200 bg-sky-50/70'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{notification.title}</p><p className="mt-1 text-sm text-slate-600">{notification.message}</p><p className="mt-2 text-xs text-slate-500">Request {notification.relatedRequestId.slice(0, 8)} · {new Date(notification.createdAt).toLocaleString()}</p></div>{!notification.readAt && <button type="button" onClick={() => void markRead(notification._id)} className="flex shrink-0 items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-800"><Check className="h-3.5 w-3.5" />Mark read</button>}</div></article>)}</div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No notifications yet. We’ll show hospital updates here.</p>}
  </section>;
}
