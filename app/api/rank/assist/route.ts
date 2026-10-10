import { requireRole } from "@/lib/auth-utils";
import { createSmartMatchAssistHandler } from "@/lib/smart-match-assist";

export const runtime = "nodejs";

const handleAssist = createSmartMatchAssistHandler({
  authorize: () => requireRole(["patient", "dispatcher"]),
  apiKey: process.env.GROK_API_KEY,
  model: process.env.GROK_MODEL,
  endpoint: process.env.GROK_API_URL,
});

export const POST = handleAssist;
