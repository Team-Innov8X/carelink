import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Document } from 'mongodb';
import { requireRole } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { completeTriage, type AIMessage, type TriageOutput } from '@/lib/ai';
import { TRIAGE_EXAMPLES, TRIAGE_OFF_TOPIC_REPLY, TRIAGE_SYSTEM_PROMPT } from '@/lib/triage-config';
import { isPromptInjection, normalizeTriageOutput, sanitizeHealthText, TRIAGE_SHORT_MESSAGE_REPLY } from '@/lib/triage-policy';

export const runtime = 'nodejs';

const inputSchema = z.object({ message: z.string().max(500), conversationId: z.string().uuid().optional() });
type StoredMessage = { role: 'user' | 'assistant'; content: string };
type TriageConversation = Document & { _id: string; userId: string; messages: StoredMessage[]; followUpCount: number; expiresAt: Date };
type TriageRateLimit = Document & { _id: string; timestamps: Date[] };

let indexesReady: Promise<void> | undefined;
async function getTriageCollections() {
  const db = (await clientPromise).db();
  const conversations = db.collection<TriageConversation>('triageConversations');
  const rateLimits = db.collection<TriageRateLimit>('triageRateLimits');
  indexesReady ??= conversations.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'triage_conversation_expiry' })
    .then(() => undefined)
    .catch((error) => { indexesReady = undefined; throw error; });
  await indexesReady;
  return { conversations, rateLimits };
}

async function rateLimitUser(rateLimits: Awaited<ReturnType<typeof getTriageCollections>>['rateLimits'], userId: string, now: Date) {
  const cutoff = new Date(now.getTime() - 60_000);
  const updated = await rateLimits.findOneAndUpdate(
    { _id: userId },
    [{ $set: { timestamps: { $filter: { input: { $concatArrays: [{ $ifNull: ['$timestamps', []] }, [now]] }, as: 'timestamp', cond: { $gt: ['$$timestamp', cutoff] } } } } }],
    { upsert: true, returnDocument: 'after' },
  );
  return (updated?.timestamps.length ?? 0) <= 10;
}

function responseHeaders(conversationId: string) {
  return { 'Cache-Control': 'no-store', 'X-CareLink-Conversation-Id': conversationId };
}

function simpleResult(reply: string, relevant: boolean): TriageOutput {
  return { relevant, reply, urgency: 'assessing', category: null, suggestions: [], shouldEscalate: false };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const authStartedAt = performance.now();
  const auth = await requireRole();
  const authMs = performance.now() - authStartedAt;
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }
  const input = inputSchema.safeParse(body);
  if (!input.success) return Response.json({ error: 'Enter a message of 500 characters or fewer.' }, { status: 400 });

  const message = input.data.message.trim();
  const now = new Date();
  const collectionStartedAt = performance.now();
  const { conversations, rateLimits } = await getTriageCollections();
  const collectionsMs = performance.now() - collectionStartedAt;
  const rateStartedAt = performance.now();
  if (!await rateLimitUser(rateLimits, auth.user.id, now)) {
    return Response.json({ error: "We couldn't check that right now. If this is an emergency, use the SOS button." }, { status: 429 });
  }
  const rateMs = performance.now() - rateStartedAt;

  const conversationId = input.data.conversationId || randomUUID();
  let conversation = await conversations.findOne({ _id: conversationId, userId: auth.user.id });
  if (input.data.conversationId && !conversation) return Response.json({ error: "We couldn't check that right now. If this is an emergency, use the SOS button." }, { status: 404 });
  if (!conversation) {
    conversation = { _id: conversationId, userId: auth.user.id, messages: [], followUpCount: 0, expiresAt: new Date(now.getTime() + 60 * 60_000) } as TriageConversation;
    await conversations.insertOne(conversation);
  }

  const sanitized = sanitizeHealthText(message);
  const currentModelText = `${sanitized.age === undefined ? '' : `[Age: ${sanitized.age}] `}${sanitized.text}`.trim();
  let result: TriageOutput;
  let nextMessages: StoredMessage[];
  let nextFollowUpCount = conversation.followUpCount;

  if (/^(?:hi|hello|hey)[!.\s]*$/i.test(message)) {
    result = simpleResult(TRIAGE_OFF_TOPIC_REPLY, false);
    nextMessages = [...conversation.messages, { role: 'user' as const, content: sanitized.text }, { role: 'assistant' as const, content: result.reply }].slice(-20);
  } else if (!message || message.length < 4) {
    result = simpleResult(TRIAGE_SHORT_MESSAGE_REPLY, true);
    nextMessages = [...conversation.messages, ...(message ? [{ role: 'user' as const, content: sanitized.text }] : []), { role: 'assistant' as const, content: result.reply }].slice(-20);
  } else {
    const modelMessages: AIMessage[] = [
      { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
      { role: 'system', content: `Few-shot examples: ${JSON.stringify(TRIAGE_EXAMPLES)}. Follow-up questions already asked: ${conversation.followUpCount}.` },
      ...conversation.messages.slice(-5).map((item) => ({ role: item.role, content: item.content })),
      { role: 'user', content: currentModelText },
    ];
    const modelStartedAt = performance.now();
    try {
      const modelResult = await completeTriage(modelMessages);
      result = normalizeTriageOutput(modelResult, conversation.followUpCount, isPromptInjection(message));
    } catch (error) {
      const errorName = error instanceof Error ? error.message : 'UNKNOWN';
      if (process.env.CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'triage_model', durationMs: Math.round((performance.now() - modelStartedAt) * 100) / 100, error: errorName }));
      return Response.json({ error: "We couldn't check that right now. If this is an emergency, use the SOS button." }, { status: errorName === 'AI_RATE_LIMITED' ? 429 : 503 });
    }
    if (result.relevant && result.urgency === 'assessing') nextFollowUpCount += 1;
    else if (result.relevant) nextFollowUpCount = 0;
    nextMessages = [...conversation.messages, { role: 'user' as const, content: currentModelText }, { role: 'assistant' as const, content: result.reply }].slice(-20);
    if (process.env.CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'triage_model', durationMs: Math.round((performance.now() - modelStartedAt) * 100) / 100 }));
  }

  const updateStartedAt = performance.now();
  await conversations.updateOne(
    { _id: conversationId, userId: auth.user.id },
    { $set: { messages: nextMessages, followUpCount: nextFollowUpCount, expiresAt: new Date(now.getTime() + 60 * 60_000), updatedAt: now } },
  );
  const updateMs = performance.now() - updateStartedAt;
  if (process.env.CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'triage_chat_post', authMs: Math.round(authMs * 100) / 100, collectionsMs: Math.round(collectionsMs * 100) / 100, rateLimitMs: Math.round(rateMs * 100) / 100, conversationUpdateMs: Math.round(updateMs * 100) / 100, totalMs: Math.round((performance.now() - startedAt) * 100) / 100 }));
  return Response.json(result, { headers: responseHeaders(conversationId) });
}
