'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

const MINIMUM_TRANSITION_MS = 900;
const SHOW_AFTER_MS = 90;

export default function NavigationTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeKey = pathname;
  const [visible, setVisible] = useState(false);
  const startedAt = useRef<number | null>(null);
  const previousRoute = useRef(routeKey);
  const showTimer = useRef<number | null>(null);

  useEffect(() => {
    const handleNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const destinationKey = destination.pathname;
      if (destinationKey === routeKey) return;

      startedAt.current = Date.now();
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
      showTimer.current = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    };

    document.addEventListener('click', handleNavigation, true);
    return () => {
      document.removeEventListener('click', handleNavigation, true);
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
    };
  }, [routeKey]);

  useEffect(() => {
    if (previousRoute.current === routeKey) return;
    previousRoute.current = routeKey;
    const navigationStartedAt = startedAt.current ?? Date.now();
    startedAt.current = navigationStartedAt;
    if (showTimer.current !== null) window.clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => setVisible(true), 0);
    const elapsed = Date.now() - navigationStartedAt;
    const remaining = Math.max(0, MINIMUM_TRANSITION_MS - elapsed);
    const hideTimer = window.setTimeout(() => {
      startedAt.current = null;
      setVisible(false);
    }, remaining);
    return () => window.clearTimeout(hideTimer);
  }, [routeKey]);

  return (
    <>
      {children}
      {visible && (
        <div className="fixed inset-0 z-[10000] overflow-auto bg-slate-50" role="status" aria-live="polite" aria-label="Loading page">
          <div className="h-16 border-b border-slate-200 bg-white">
            <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
              <div className="flex items-center gap-3"><div className="h-10 w-10 animate-pulse rounded-xl bg-slate-200" /><div className="h-4 w-28 animate-pulse rounded bg-slate-200" /></div>
              <div className="hidden gap-3 sm:flex"><div className="h-9 w-20 animate-pulse rounded-lg bg-slate-100" /><div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" /></div>
            </div>
          </div>
          <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
            <div className="space-y-3"><div className="h-3 w-28 animate-pulse rounded bg-slate-200" /><div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-slate-200" /><div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" /></div>
            <div className="grid gap-6 md:grid-cols-2">
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"><div className="h-5 w-40 animate-pulse rounded bg-slate-200" /><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="h-11 animate-pulse rounded-xl bg-slate-100" /><div className="h-10 w-36 animate-pulse rounded-lg bg-slate-200" /></section>
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"><div className="h-5 w-36 animate-pulse rounded bg-slate-200" /><div className="h-16 animate-pulse rounded-xl bg-slate-100" /><div className="h-16 animate-pulse rounded-xl bg-slate-100" /><div className="h-16 animate-pulse rounded-xl bg-slate-100" /></section>
            </div>
          </main>
        </div>
      )}
    </>
  );
}
