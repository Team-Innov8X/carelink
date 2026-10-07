import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
import {
  evaluateClinicalRules,
  sanitizeAndValidateTriageOutput,
  generateTriageResponse,
  SYSTEM_PROMPT,
} from "../lib/triage-llm.ts";
import { checkRateLimit } from "../lib/rate-limiter.ts";
import { rankHospitals } from "../lib/ranking.ts";

test("Triage LLM: Chest pain immediately escalates to critical cardiac_arrest with shouldEscalate: true", async () => {
  const result = evaluateClinicalRules("chest pain and dizziness", [], 0);
  assert.equal(result.urgency, "critical");
  assert.equal(result.category, "cardiac_arrest");
  assert.equal(result.shouldEscalate, true);
  assert.match(result.reply.toLowerCase(), /emergency services|call/i);
});

test("Triage LLM: Stroke symptoms (FAST signs) escalate to critical stroke_symptoms", async () => {
  const result = evaluateClinicalRules("my father has face drooping and slurred speech", [], 0);
  assert.equal(result.urgency, "critical");
  assert.equal(result.category, "stroke_symptoms");
  assert.equal(result.shouldEscalate, true);
});

test("Triage LLM: Severe bleeding escalates to critical severe_bleeding", async () => {
  const result = evaluateClinicalRules("deep cut on leg, heavy spurting blood cannot stop", [], 0);
  assert.equal(result.urgency, "critical");
  assert.equal(result.category, "severe_bleeding");
  assert.equal(result.shouldEscalate, true);
});

test("Triage LLM: Ambiguous mild symptom asks clarifying question with assessing and category null", async () => {
  const result = evaluateClinicalRules("I have a slight headache and feel a bit tired", [], 0);
  assert.equal(result.urgency, "assessing");
  assert.equal(result.category, null);
  assert.equal(result.shouldEscalate, false);
  assert.match(result.reply, /\?/); // Must ask a clarifying question
  assert.match(result.reply.toLowerCase(), /emergency services/i);
});

test("Triage LLM: Non-emergency follow-up sets low urgency and suggests non-emergency care", async () => {
  const history = [
    { role: "user", content: "I have a sore throat for two days" },
    { role: "assistant", content: "Are you having difficulty breathing or chest pain?" },
  ];
  const result = evaluateClinicalRules("No chest pain or breathing issues, just a scratchy throat", history, 1);
  assert.equal(result.urgency, "low");
  assert.equal(result.shouldEscalate, false);
  assert.notEqual(result.category, null);
  assert.match(result.reply.toLowerCase(), /urgent care|clinic|emergency services/i);
});

test("Triage LLM: Question limit is respected (maximum 2 clarifying questions)", () => {
  // If questionCount is already 2, bot must not remain in assessing
  const validated = sanitizeAndValidateTriageOutput(
    {
      reply: "Still evaluating your condition.",
      urgency: "assessing",
      category: null,
      shouldEscalate: false,
    },
    2 // questionCount = 2
  );
  assert.notEqual(validated.urgency, "assessing");
  assert.notEqual(validated.category, null);
});

test("Triage LLM: Critical urgency always forces shouldEscalate to true", () => {
  const validated = sanitizeAndValidateTriageOutput(
    {
      reply: "This looks like a severe emergency.",
      urgency: "critical",
      category: "cardiac_arrest",
      shouldEscalate: false, // Model erroneously returned false
    },
    0
  );
  assert.equal(validated.shouldEscalate, true);
});

test("Triage LLM: System prompt contains strict safety rules", () => {
  assert.match(SYSTEM_PROMPT, /NEVER name a specific diagnosis/i);
  assert.match(SYSTEM_PROMPT, /NEVER give treatment advice/i);
  assert.match(SYSTEM_PROMPT, /set urgency to "critical" immediately/i);
  assert.match(SYSTEM_PROMPT, /Always include a reminder that the patient can call emergency services directly/i);
  assert.match(SYSTEM_PROMPT, /cardiac_arrest, trauma, respiratory_distress, stroke_symptoms/i);
});

test("Rate Limiter: Correctly throttles excessive calls", () => {
  const testId = "test-rate-limit-client-" + Date.now();
  for (let i = 0; i < 5; i++) {
    const res = checkRateLimit(testId, 5, 10_000);
    assert.equal(res.success, true);
  }
  const blocked = checkRateLimit(testId, 5, 10_000);
  assert.equal(blocked.success, false);
  assert.ok(blocked.resetSeconds > 0);
});

test("Ranking Engine integration: Triage category cardiac_arrest matches cardiac resources", () => {
  const fakeHospitals = [
    {
      id: "cardiac-center",
      name: "Metro Heart Institute",
      location: { type: "Point", coordinates: [77.2, 28.6] },
      status: "active",
      travelTimeMinutes: 10,
      resources: [
        { category: "cardiologist", availableQuantity: 2, updatedAt: new Date() },
        { category: "icu", availableQuantity: 4, updatedAt: new Date() },
      ],
    },
  ];
  const ranked = rankHospitals(fakeHospitals, {
    emergencyType: "cardiac_arrest",
    ambulanceLocation: { latitude: 28.6, longitude: 77.2 },
  });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].hospitalId, "cardiac-center");
  assert.ok(ranked[0].matchedResources.includes("cardiologist"));
});

test("Triage Service: persists conversation server-side, tracks question count, and stores logs", async () => {
  const {
    getConversation,
    saveConversation,
    logClassification,
    getRecentTriageLogs,
  } = await import("../lib/services/triage-service.ts");

  const testConvId = "conv-" + Date.now();
  await saveConversation({
    _id: testConvId,
    messages: [
      { role: "user", content: "chest pain", timestamp: new Date() },
      { role: "assistant", content: "Connecting you to emergency care.", timestamp: new Date(), urgency: "critical", category: "cardiac_arrest", shouldEscalate: true },
    ],
    questionCount: 0,
    urgency: "critical",
    category: "cardiac_arrest",
    shouldEscalate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const loaded = await getConversation(testConvId);
  assert.ok(loaded);
  assert.equal(loaded._id, testConvId);
  assert.equal(loaded.urgency, "critical");
  assert.equal(loaded.shouldEscalate, true);
  assert.equal(loaded.messages.length, 2);

  // Test audit log storage
  await logClassification({
    conversationId: testConvId,
    input: "chest pain",
    history: [],
    output: {
      reply: "Connecting you to emergency care.",
      urgency: "critical",
      category: "cardiac_arrest",
      shouldEscalate: true,
    },
    shouldEscalate: true,
    provider: "clinical-safety-engine",
    timestamp: new Date(),
  });

  const logs = await getRecentTriageLogs(10);
  const foundLog = logs.find((l) => l.conversationId === testConvId);
  assert.ok(foundLog);
  assert.equal(foundLog.output.category, "cardiac_arrest");
  assert.equal(foundLog.shouldEscalate, true);
});

