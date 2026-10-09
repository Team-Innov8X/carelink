'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, RefreshCw } from '@/components/icons';
import { useCareLink } from '../../context/CareLinkContext';

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
  const { emergencies, setSelectedEmergencyId, setActiveTab } = useCareLink();
  const [notifications, setNotifications] = useState<CareNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

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
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  const markRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Could not mark this notification as read.');
      setNotifications((items) => items.map((item) => item._id === notificationId ? { ...item, readAt: new Date().toISOString() } : item));
    } catch {
      setMessage('Could not mark this notification as read.');
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((item) => !item.readAt);
    if (!unread.length) return;
    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => item.readAt ? item : { ...item, readAt }));
    try {
      const response = await fetch('/api/notifications', { method: 'PATCH' });
      if (!response.ok) throw new Error();
    } catch {
      setNotifications((items) => items.map((item) => unread.some((old) => old._id === item._id) ? { ...item, readAt: undefined } : item));
      setMessage('Could not mark all notifications as read.');
    }
  };
  const openRelatedCase = (notification: CareNotification) => {
    const match = emergencies.find((item) => item.id === notification.relatedRequestId);
    if (match) setSelectedEmergencyId(match.id);
    setActiveTab(match ? 'handoff' : 'recommendations');
    if (!notification.readAt) void markRead(notification._id);
  };

  const categories = Array.from(new Set(notifications.map((item) => item.type)));
  const visible = notifications.filter((item) =>
    (statusFilter === 'all' || (statusFilter === 'read' ? Boolean(item.readAt) : !item.readAt)) &&
    (categoryFilter === 'all' || item.type === categoryFilter)
  );

  return <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Bell className="h-5 w-5 text-sky-700" />Notifications</h1><p className="mt-1 text-sm text-slate-500">Updates about your emergency and hospital response.</p></div><div className="flex gap-2"><button type="button" onClick={() => void markAllRead()} disabled={!notifications.some((item) => !item.readAt)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><CheckCheck className="h-4 w-4" />Mark all as read</button><button type="button" onClick={() => void refresh()} aria-label="Refresh notifications" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button></div></div>
    <div className="mb-4 flex flex-wrap gap-2"><label className="text-xs font-semibold text-slate-600">Status <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5"><option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option></select></label>{categories.length > 1 && <label className="text-xs font-semibold text-slate-600">Category <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5"><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}</select></label>}<span className="self-center text-xs text-slate-500">{notifications.filter((item) => !item.readAt).length} unread</span></div>
    {message && <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</p>}
    {loading ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Loading notifications…</p> : visible.length ? <div className="space-y-3">{visible.map((notification) => { const urgent = notification.type.includes('rejected') || notification.type.includes('stale'); return <article key={notification._id} className={`rounded-xl border p-4 ${notification.readAt ? 'border-slate-200 bg-white' : urgent ? 'border-rose-200 bg-rose-50/70' : 'border-sky-200 bg-sky-50/70'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{notification.title}</p><p className="mt-1 text-sm text-slate-600">{notification.message}</p><p className="mt-2 text-xs text-slate-500">{notification.type.replaceAll('_', ' ')} · Request {notification.relatedRequestId.slice(0, 8)} · {new Date(notification.createdAt).toLocaleString()}</p><div className="mt-2 flex items-center gap-3"><p className="text-xs font-medium text-slate-500">{notification.readAt ? 'Read' : 'Unread'}</p><button type="button" onClick={() => openRelatedCase(notification)} className="text-xs font-semibold text-sky-800 hover:underline">Open related case</button></div></div>{!notification.readAt && <button type="button" onClick={() => void markRead(notification._id)} className="flex shrink-0 items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-800"><Check className="h-3.5 w-3.5" />Mark read</button>}</div></article>; })}</div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">{notifications.length ? 'No notifications match these filters.' : 'No notifications yet. We’ll show hospital updates here.'}</p>}
  </section>;
}
