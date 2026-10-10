import { requireRole } from "@/lib/auth-utils";
import { createSmartMatchAssistHandler } from "@/lib/smart-match-assist";

export const runtime = "nodejs";

const handleAssist = createSmartMatchAssistHandler({
  authorize: () => requireRole(["patient", "dispatcher"]),
  provider: process.env.GROQ_API_KEY ? "groq" : "grok",
  apiKey: process.env.GROQ_API_KEY || process.env.GROK_API_KEY,
  model: process.env.GROQ_API_KEY ? process.env.GROQ_MODEL || "openai/gpt-oss-120b" : process.env.GROK_MODEL,
  endpoint: process.env.GROQ_API_KEY
    ? process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions"
    : process.env.GROK_API_URL,
});

export const POST = handleAssist;
