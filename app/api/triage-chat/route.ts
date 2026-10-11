import { requireRole } from '@/lib/auth-utils';
import { classifyMessage, fallbackReply, INTENT_REPLIES, ensureEmergencySentence, applyRedFlagOverride, isMessageTooLong } from '@/lib/triage/gate';
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
    const role = entry.role as 'user' | 'assistant';
    const followUpQuestion = role === 'assistant' && typeof entry.followUpQuestion === 'string'
      ? entry.followUpQuestion.slice(0, 240)
      : null;
    const content = entry.content.slice(0, MAX_MESSAGE_CHARS);
    return [{
      role,
      content: followUpQuestion ? `${content}\nFollow-up question asked: ${followUpQuestion}` : content,
      followUpQuestion,
    }];
  });
}

function fallbackContext(history: TriageMessage[], message: string) {
  let followUpIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].role === 'assistant' && history[index].followUpQuestion) {
      followUpIndex = index;
      break;
    }
  }
  if (followUpIndex < 0) return message;

  for (let index = followUpIndex - 1; index >= 0; index -= 1) {
    if (history[index].role === 'user') return `${history[index].content} ${message}`;
  }
  return message;
}

function logResult(startedAt: number, intent: string, severity: string | null, fallback: boolean, errorCode?: string) {
  console.info(JSON.stringify({ event: 'triage.request', intent, severity, latencyMs: Math.round(performance.now() - startedAt), fallback, ...(errorCode ? { errorCode } : {}) }));
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let auth: Awaited<ReturnType<typeof requireRole>>;
  try {
    auth = await requireRole('patient');
  } catch {
    console.error(JSON.stringify({ event: 'triage.auth_error', errorCode: 'AUTH_SESSION_UNAVAILABLE' }));
    return Response.json({ error: 'We could not verify your sign-in right now. Check your connection and try again.' }, { status: 503 });
  }
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });

  if (!consumeRateLimit(String(auth.user.id))) return Response.json({ error: 'You have sent several messages recently. Please wait a few minutes and try again.' }, { status: 429 });

  let body: RequestBody;
  try { body = await request.json() as RequestBody; }
  catch { return Response.json({ error: 'Please send a valid message.' }, { status: 400 }); }
  if (typeof body.message !== 'string') return Response.json({ error: 'Please describe your symptoms in a message.' }, { status: 400 });
  if (isMessageTooLong(body.message, MAX_MESSAGE_CHARS)) return Response.json({ error: `Please keep your message under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });

  const message = body.message.trim();
  const history = safeHistory(body.history);
  const gate = classifyMessage(message);
  const hasPendingTriageFollowUp = history.some((item) => item.role === 'assistant' && item.followUpQuestion);
  const continuingTriage = hasPendingTriageFollowUp && gate.intent !== 'greeting' && gate.intent !== 'off_topic';
  let intent = continuingTriage ? 'symptoms' : gate.intent;
  if (!continuingTriage && !gate.certain && !gate.redFlag) {
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
    output = fallbackReply(gate.redFlag, EMERGENCY_FALLBACK_TEXT, fallbackContext(history, message), askedCount > 0);
    fallback = true;
    const code = error instanceof Error ? error.message : '';
    errorCode = /^TRIAGE_[A-Z_]+$/.test(code) ? code : error instanceof Error && error.name === 'ZodError' ? 'TRIAGE_INVALID_RESPONSE' : error instanceof Error && error.name === 'TimeoutError' ? 'TRIAGE_TIMEOUT' : 'TRIAGE_MODEL_ERROR';
  }

  if (gate.redFlag) {
    output = applyRedFlagOverride(output, EMERGENCY_FALLBACK_TEXT);
  } else if (output.severity === 'emergency') {
    output = { ...output, reply: ensureEmergencySentence(output.reply, EMERGENCY_FALLBACK_TEXT), followUpQuestion: null };
  }
  if (!/This is guidance, not a medical diagnosis\.?/i.test(output.reply)) output = { ...output, reply: `${output.reply.trim()} This is guidance, not a medical diagnosis.` };
  if (askedCount >= MAX_FOLLOW_UPS) output = { ...output, followUpQuestion: null };

  logResult(startedAt, 'symptoms', output.severity, fallback, errorCode);
  return Response.json({ ...output, fallback });
}
