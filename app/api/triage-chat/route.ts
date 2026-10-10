import { requireRole } from '@/lib/auth-utils';
import { classifyMessage, fallbackReply, INTENT_REPLIES, ensureEmergencySentence, applyRedFlagOverride } from '@/lib/triage/gate';
import { EMERGENCY_FALLBACK_TEXT, MAX_FOLLOW_UPS, MAX_HISTORY_TURNS, MAX_MESSAGE_CHARS } from '@/lib/triage/constants';
import { buildTriagePrompt, TRIAGE_FEW_SHOT } from '@/lib/triage/prompt';
import { classifyWithModel, consumeRateLimit, triageWithModel } from '@/lib/triage/llm';
import type { TriageMessage, TriageResponse } from '@/lib/triage/schema';

type RequestBody = { message?: unknown; history?: unknown };
const genericError = "I couldn't process that request. Please try again.";

function result(intent: string, reply: string) {
  return { intent, severity: null, reply, nextSteps: [], followUpQuestion: null, suggestedSpecialty: null, fallback: false };
}

function safeHistory(value: unknown): TriageMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY_TURNS * 2).flatMap((item): TriageMessage[] => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    if (!['user', 'assistant'].includes(String(entry.role)) || typeof entry.content !== 'string') return [];
    return [{ role: entry.role as 'user' | 'assistant', content: entry.content.slice(0, MAX_MESSAGE_CHARS), followUpQuestion: typeof entry.followUpQuestion === 'string' ? entry.followUpQuestion : null }];
  });
}

function logResult(startedAt: number, intent: string, severity: string | null, fallback: boolean, errorCode?: string) {
  console.info(JSON.stringify({ event: 'triage.request', intent, severity, latencyMs: Math.round(performance.now() - startedAt), fallback, ...(errorCode ? { errorCode } : {}) }));
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const auth = await requireRole('patient');
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });

  if (!consumeRateLimit(String(auth.user.id))) return Response.json({ error: 'You have sent several messages recently. Please wait a few minutes and try again.' }, { status: 429 });

  let body: RequestBody;
  try { body = await request.json() as RequestBody; }
  catch { return Response.json({ error: 'Please send a valid message.' }, { status: 400 }); }
  if (typeof body.message !== 'string') return Response.json({ error: 'Please describe your symptoms in a message.' }, { status: 400 });
  if (body.message.length > MAX_MESSAGE_CHARS) return Response.json({ error: `Please keep your message under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });

  const message = body.message.trim();
  const gate = classifyMessage(message);
  let intent = gate.intent;
  if (!gate.certain && !gate.redFlag) {
    try { intent = await classifyWithModel(message); }
    catch {
      logResult(startedAt, 'unclear', null, true, 'INTENT_CLASSIFICATION_FAILED');
      return Response.json({ ...result('unclear', genericError), fallback: true });
    }
  }

  if (intent !== 'symptoms') {
    const response = result(intent, INTENT_REPLIES[intent]);
    logResult(startedAt, intent, null, false);
    return Response.json(response);
  }

  const history = safeHistory(body.history);
  const askedCount = history.filter((item) => item.role === 'assistant' && item.followUpQuestion).length;
  let output: TriageResponse;
  let fallback = false;
  let errorCode: string | undefined;
  try {
    output = await triageWithModel([
      { role: 'system', content: buildTriagePrompt(EMERGENCY_FALLBACK_TEXT) },
      ...TRIAGE_FEW_SHOT,
      ...history,
      { role: 'user', content: `User symptoms: ${message}\nFollow-up questions already asked: ${askedCount}.${askedCount >= MAX_FOLLOW_UPS ? ' Do not ask another follow-up; summarize safe next steps.' : ''}` },
    ]);
  } catch (error) {
    output = fallbackReply(gate.redFlag, EMERGENCY_FALLBACK_TEXT);
    fallback = true;
    const code = error instanceof Error ? error.message : '';
    errorCode = /^TRIAGE_[A-Z_]+$/.test(code) ? code : error instanceof Error && error.name === 'ZodError' ? 'TRIAGE_INVALID_RESPONSE' : error instanceof Error && error.name === 'TimeoutError' ? 'TRIAGE_TIMEOUT' : 'TRIAGE_MODEL_ERROR';
  }

  if (gate.redFlag) {
    output = applyRedFlagOverride(output, EMERGENCY_FALLBACK_TEXT);
  } else if (output.severity === 'emergency') {
    output = { ...output, reply: ensureEmergencySentence(output.reply, EMERGENCY_FALLBACK_TEXT), followUpQuestion: null };
  }
  if (askedCount >= MAX_FOLLOW_UPS) output = { ...output, followUpQuestion: null };

  logResult(startedAt, 'symptoms', output.severity, fallback, errorCode);
  return Response.json({ ...output, fallback });
}
