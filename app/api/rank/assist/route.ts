import { requireRole } from "@/lib/auth-utils";
import { createSmartMatchAssistHandler } from "@/lib/smart-match-assist";
import { generateSmartMatchCriteria } from "@/lib/gemini";

export const runtime = "nodejs";

const handleAssist = createSmartMatchAssistHandler({
  authorize: () => requireRole(["patient", "dispatcher"]),
  configured: Boolean(process.env.GEMINI_API_KEY),
  development: process.env.NODE_ENV !== "production",
  generate: process.env.GEMINI_API_KEY ? (prompt) => generateSmartMatchCriteria(process.env.GEMINI_API_KEY!, prompt) : undefined,
});

export const POST = handleAssist;
