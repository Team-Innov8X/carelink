"use client";

import App from "../App";
import type { Role } from "../types";

export default function ClientApp({ initialRole = 'dispatcher' }: { initialRole?: Role }) {
  return <App initialRole={initialRole} />;
}
