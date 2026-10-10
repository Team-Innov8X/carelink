import { z } from 'zod';

export const triageOutputSchema = z.object({
  relevant: z.boolean(),
  reply: z.string().trim().max(1200),
  urgency: z.enum(['critical', 'high', 'moderate', 'low', 'assessing']),
  category: z.enum(['cardiac', 'trauma', 'respiratory', 'stroke', 'bleeding', 'allergic', 'burns', 'other']).nullable(),
  suggestions: z.array(z.string().trim().min(1).max(120)).max(3),
  shouldEscalate: z.boolean(),
}).superRefine((value, context) => {
  if (value.relevant && !value.reply) context.addIssue({ code: 'custom', path: ['reply'], message: 'Relevant triage replies must not be empty.' });
});

export type TriageOutput = z.infer<typeof triageOutputSchema>;
export type AIMessage = { role: 'system' | 'user' | 'assistant'; content: string };

async function requestCompletion(messages: AIMessage[], repair = false): Promise<unknown> {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.x.ai/v1').replace(/\/+$/, '');
  if (!apiKey || !model) throw new Error('AI_PROVIDER_NOT_CONFIGURED');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: repair ? 0 : 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: repair
        ? [...messages, { role: 'system', content: 'Your previous response did not match the required JSON schema. Return only valid JSON that exactly matches the schema.' }]
        : messages,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_UNAVAILABLE');
  const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  return data.choices?.[0]?.message?.content;
}

export async function completeTriage(messages: AIMessage[]): Promise<TriageOutput> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await requestCompletion(messages, attempt === 1);
    let content: unknown;
    try { content = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { if (attempt === 0) continue; else break; }
    const parsed = triageOutputSchema.safeParse(content);
    if (parsed.success) return parsed.data;
  }
  throw new Error('AI_INVALID_RESPONSE');
}
