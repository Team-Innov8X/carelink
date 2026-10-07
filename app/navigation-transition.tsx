'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SignupSkeleton, DashboardSkeleton } from '../components/common/Skeletons';

const MINIMUM_TRANSITION_MS = 250;
const SHOW_AFTER_MS = 80;

function isAuthRoute(path: string) {
  return path.startsWith('/signup') || path.startsWith('/signin') || path.startsWith('/onboarding');
}

export default function NavigationTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeKey = pathname;
  const [visible, setVisible] = useState(false);
  const [targetPath, setTargetPath] = useState(pathname);
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

      setTargetPath(destinationKey);
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
    setTargetPath(routeKey);
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

  const showSignupSkeleton = isAuthRoute(targetPath);

  return (
    <>
      {children}
      {visible && (showSignupSkeleton ? <SignupSkeleton /> : <DashboardSkeleton />)}
    </>
  );
}
