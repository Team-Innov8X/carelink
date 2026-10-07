import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limiter";
import {
  getConversation,
  saveConversation,
  logClassification,
  getRecentTriageLogs,
  type TriageConversation,
  type TriageMessage,
} from "@/lib/services/triage-service";
import { generateTriageResponse } from "@/lib/triage-llm";
import { getServerSession } from "@/lib/auth-utils";
import crypto from "node:crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // 1. Rate limiting by IP
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "client-default";

  const rateLimit = checkRateLimit(clientIp, 25, 60_000);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error: "Too many triage requests. Please wait a moment or call emergency services immediately (911 / 112 / 108).",
        retryAfter: rateLimit.resetSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.resetSeconds) },
      }
    );
  }

  // 2. Parse and validate input JSON
  let body: { message?: unknown; conversationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!rawMessage) {
    return NextResponse.json({ error: "message is required and must not be empty." }, { status: 400 });
  }

  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.trim()
      ? body.conversationId.trim()
      : crypto.randomUUID();

  // 3. Optional session for tracking user
  const session = await getServerSession().catch(() => null);
  const userId = session?.user?.id;

  // 4. Retrieve server-side conversation state (DO NOT trust client history)
  let conversation: TriageConversation | null = await getConversation(conversationId);
  if (!conversation) {
    conversation = {
      _id: conversationId,
      userId,
      messages: [],
      questionCount: 0,
      shouldEscalate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // 5. SAFETY PROTOCOL: If conversation is already classified as critical/high, STOP chatting immediately.
  if (conversation.shouldEscalate || conversation.urgency === "critical" || conversation.urgency === "high") {
    const lockedReply =
      "This condition has already been escalated to emergency care. For your safety, the chat is closed. Please connect to the recommended hospital or call emergency services immediately (911 / 112 / 108).";

    return NextResponse.json({
      reply: lockedReply,
      urgency: conversation.urgency || "critical",
      category: conversation.category || "other",
      shouldEscalate: true,
      conversationId,
      isLocked: true,
    });
  }

  // 6. Call Triage LLM / Safety Engine with server-side history
  const historyForPrompt = conversation.messages.slice(-6).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const triageResult = await generateTriageResponse(
    rawMessage,
    historyForPrompt,
    conversation.questionCount
  );

  // 7. Update server-side conversation state
  const newUserMessage: TriageMessage = {
    role: "user",
    content: rawMessage,
    timestamp: new Date(),
  };

  const newAssistantMessage: TriageMessage = {
    role: "assistant",
    content: triageResult.reply,
    timestamp: new Date(),
    urgency: triageResult.urgency,
    category: triageResult.category,
    shouldEscalate: triageResult.shouldEscalate,
  };

  conversation.messages.push(newUserMessage, newAssistantMessage);
  conversation.urgency = triageResult.urgency;
  conversation.category = triageResult.category;
  conversation.shouldEscalate = triageResult.shouldEscalate;

  if (triageResult.urgency === "assessing") {
    conversation.questionCount += 1;
  }

  await saveConversation(conversation);

  // 8. Log classification for audit, debugging, and evaluation
  await logClassification({
    conversationId,
    userId,
    input: rawMessage,
    history: historyForPrompt,
    output: {
      reply: triageResult.reply,
      urgency: triageResult.urgency,
      category: triageResult.category,
      shouldEscalate: triageResult.shouldEscalate,
    },
    shouldEscalate: triageResult.shouldEscalate,
    provider: triageResult.provider,
    timestamp: new Date(),
  });

  // 9. Return structured classification JSON shape matching exact specification
  return NextResponse.json({
    reply: triageResult.reply,
    urgency: triageResult.urgency,
    category: triageResult.category,
    shouldEscalate: triageResult.shouldEscalate,
    conversationId,
    questionCount: conversation.questionCount,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const conversationId = searchParams.get("conversationId");

  if (action === "logs") {
    const logs = await getRecentTriageLogs(50);
    return NextResponse.json({ logs });
  }

  if (conversationId) {
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  }

  return NextResponse.json({
    service: "CareLink Triage Engine",
    status: "active",
    validCategories: [
      "cardiac_arrest",
      "trauma",
      "respiratory_distress",
      "stroke_symptoms",
      "severe_bleeding",
      "allergic_reaction",
      "burns",
      "other",
    ],
  });
}
