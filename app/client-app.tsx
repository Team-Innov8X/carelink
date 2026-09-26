"use client";

import { useEffect, useState } from "react";
import App from "../App";

export default function ClientApp() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <main className="min-h-screen bg-slate-50" aria-label="Loading CareLink" />;
  }

  return <App />;
}
