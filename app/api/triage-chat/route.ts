import { z } from 'zod';
import { requireRole } from '@/lib/auth-utils';
import { TRIAGE_EXAMPLES, TRIAGE_OFF_TOPIC_REPLY, TRIAGE_SYSTEM_PROMPT } from '@/lib/triage-config';

export const runtime = 'nodejs';
const inputSchema = z.object({ message: z.string().trim().min(1).max(1000) });
const outputSchema = z.object({
  is_health_related: z.boolean(), reply: z.string().max(1200),
  urgency: z.enum(['critical', 'high', 'moderate', 'low', 'assessing']),
  category: z.enum(['cardiac', 'trauma', 'respiratory', 'stroke', 'bleeding', 'allergic', 'burns', 'other']).nullable(),
  follow_up: z.string().max(300).nullable(), shouldEscalate: z.boolean(),
});
const limits = new Map<string, { since: number; count: number }>();

export async function POST(request: Request) {
  const auth = await requireRole();
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }
  const input = inputSchema.safeParse(body);
  if (!input.success) return Response.json({ error: 'Enter a message of 1 to 1000 characters.' }, { status: 400 });
  const now = Date.now(); const prior = limits.get(auth.user.id);
  if (prior && now - prior.since < 60_000 && prior.count >= 10) return Response.json({ error: 'Please wait a minute before trying again.' }, { status: 429 });
  limits.set(auth.user.id, !prior || now - prior.since >= 60_000 ? { since: now, count: 1 } : { ...prior, count: prior.count + 1 });
  const apiKey = process.env.GROK_API_KEY;
  const model = process.env.GROK_MODEL;
  const endpoint = process.env.GROK_API_URL || 'https://api.x.ai/v1/chat/completions';
  if (!apiKey || !model) return Response.json({ error: 'Symptom check is temporarily unavailable. Please try again.' }, { status: 503 });
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 450, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
        { role: 'system', content: `Examples: ${JSON.stringify(TRIAGE_EXAMPLES)}` },
        { role: 'user', content: input.data.message },
      ] }), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return Response.json({ error: 'Symptom check is temporarily unavailable. Please try again.' }, { status: response.status === 429 ? 429 : 503 });
    const data = await response.json();
    let parsed: { success: true; data: z.infer<typeof outputSchema> } | { success: false } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = data.choices?.[0]?.message?.content;
      try { parsed = outputSchema.safeParse(JSON.parse(String(raw))); } catch { parsed = null; }
      if (parsed?.success) break;
      if (attempt === 0) {
        const retry = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.1, max_tokens: 450, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: `${TRIAGE_SYSTEM_PROMPT} Return valid JSON matching the exact schema.` }, { role: 'user', content: input.data.message }] }), signal: AbortSignal.timeout(15_000) });
        if (!retry.ok) break;
        const retryData = await retry.json();
        try { parsed = outputSchema.safeParse(JSON.parse(String(retryData.choices?.[0]?.message?.content))); } catch { parsed = null; }
      }
    }
    if (!parsed?.success) return Response.json({ error: 'Symptom check is temporarily unavailable. Please try again.' }, { status: 503 });
    const triage = parsed.data;
    if (!triage.is_health_related) return Response.json({ is_health_related: false, reply: TRIAGE_OFF_TOPIC_REPLY, urgency: 'assessing', category: null, follow_up: null, shouldEscalate: false });
    const critical = triage.urgency === 'critical' || triage.urgency === 'high';
    const reply = triage.follow_up && !critical ? triage.follow_up : triage.reply;
    return Response.json({ ...triage, reply, shouldEscalate: critical || triage.shouldEscalate });
  } catch {
    return Response.json({ error: 'Symptom check is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
