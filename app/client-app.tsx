"use client";

import { useSyncExternalStore } from "react";
import App from "../App";
import type { Role } from "../types";

export default function ClientApp({ initialRole = 'dispatcher' }: { initialRole?: Role }) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  if (!mounted) {
    return <main className="min-h-screen bg-slate-50" aria-label="Loading CareLink" />;
  }

  return <App initialRole={initialRole} />;
}
