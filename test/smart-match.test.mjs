import test from "node:test";
import assert from "node:assert/strict";
import { createSmartMatchAssistHandler, parseSmartMatchRefinement } from "../lib/smart-match-assist.ts";
import { rankRequestSchema } from "../lib/validation.ts";

const current = {
  emergencyType: "urgent care",
  requiredResources: [],
  bedCategory: "general",
  maxTravelMinutes: 60,
  priority: "balanced",
};
const request = (body) => new Request("http://localhost/api/rank/assist", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

test("natural language fallback safely extracts criteria and clamps travel", () => {
  const parsed = parseSmartMatchRefinement("Find a heart specialist with ICU within 300 minutes, prioritize closer", current);
  assert.deepEqual(parsed.requiredResources, ["icu", "cardiologist"]);
  assert.equal(parsed.bedCategory, "icu");
  assert.equal(parsed.maxTravelMinutes, 240);
  assert.equal(parsed.priority, "travel");
});

test("invalid requests are rejected before calling the provider", async () => {
  let calls = 0;
  const handler = createSmartMatchAssistHandler({ authorize: async () => ({ authorized: true, user: { id: "p1" } }), apiKey: "secret", model: "test", fetcher: async () => { calls += 1; throw new Error("should not run"); } });
  const response = await handler(request({ message: " ".repeat(2), current }));
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("unauthorized users cannot use the assistant", async () => {
  const handler = createSmartMatchAssistHandler({ authorize: async () => ({ authorized: false, reason: "UNAUTHENTICATED" }) });
  assert.equal((await handler(request({ message: "Find ICU", current }))).status, 401);
});

test("provider outage falls back to deterministic criteria", async () => {
  const handler = createSmartMatchAssistHandler({
    authorize: async () => ({ authorized: true, user: { id: "p1" } }), apiKey: "secret", model: "test",
    fetcher: async () => { throw new Error("timeout"); },
  });
  const response = await handler(request({ message: "Find ICU and prioritize closer", current }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.source, "fallback");
  assert.ok(body.criteria.requiredResources.includes("icu"));
  assert.equal(body.criteria.priority, "travel");
});

test("provider output is allowlisted and invalid structured output falls back", async () => {
  const handler = createSmartMatchAssistHandler({
    authorize: async () => ({ authorized: true, user: { id: "p1" } }), provider: "groq", apiKey: "secret", model: "test",
    fetcher: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ ...current, emergencyType: "cardiac", requiredResources: ["secret_database", "heart specialist"] }) } }] }),
  });
  const response = await handler(request({ message: "Find heart care", current }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.source, "groq");
  assert.deepEqual(body.criteria.requiredResources, ["cardiologist"]);
  assert.equal(JSON.stringify(body).includes("secret_database"), false);
});

test("an ambiguous new search asks for the missing care need without applying defaults", async () => {
  const handler = createSmartMatchAssistHandler({ authorize: async () => ({ authorized: true, user: { id: "p1" } }) });
  const response = await handler(request({ message: "Find a nearby hospital", mode: "search", current: { ...current, emergencyType: "" } }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.needsClarification, true);
  assert.match(body.clarificationQuestion, /kind of care/i);
  assert.equal(body.criteria.emergencyType, "");
});

test("a clear natural-language request becomes validated criteria without an AI provider", async () => {
  const handler = createSmartMatchAssistHandler({ authorize: async () => ({ authorized: true, user: { id: "p1" } }) });
  const response = await handler(request({ message: "Find a hospital with an ICU bed and ventilator within 20 minutes", mode: "search", current: { ...current, emergencyType: "" } }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.needsClarification, undefined);
  assert.ok(body.criteria.requiredResources.includes("icu"));
  assert.ok(body.criteria.requiredResources.includes("ventilator"));
  assert.equal(body.criteria.maxTravelMinutes, 20);
});

test("AI clarification is returned without changing existing criteria", async () => {
  const handler = createSmartMatchAssistHandler({
    authorize: async () => ({ authorized: true, user: { id: "p1" } }), apiKey: "secret", model: "test",
    fetcher: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ action: "clarify", clarificationQuestion: "Which care service do you need?", criteria: current }) } }] }),
  });
  const response = await handler(request({ message: "Find care", mode: "search", current }));
  const body = await response.json();
  assert.equal(body.needsClarification, true);
  assert.equal(body.criteria.emergencyType, current.emergencyType);
});

test("AI match explanations receive only server-resolved facts and fall back deterministically", async () => {
  const facts = { name: "CareLink Hospital", score: 84, matchedResources: ["icu"], missingResources: [], travelTimeMinutes: null, status: "active", confirmationStatus: "availability reported, live confirmation unavailable", stale: true };
  let providerPrompt = "";
  const handler = createSmartMatchAssistHandler({
    authorize: async () => ({ authorized: true, user: { id: "p1" } }),
    loadHospitalMatchFacts: async (id) => id === "h-1" ? facts : null,
    apiKey: "secret", model: "test",
    fetcher: async (_url, init) => {
      providerPrompt = String(init?.body ?? "");
      return Response.json({ choices: [{ message: { content: JSON.stringify({ explanation: "The hospital reports ICU resources; its inventory is stale and confirmation is unavailable." }) } }] });
    },
  });
  const response = await handler(request({ message: "Explain this match", mode: "explain", hospitalId: "h-1", matchCriteria: { emergencyType: "cardiac", ambulanceLocation: { latitude: 12, longitude: 77 }, requiredResources: ["icu"] }, current }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.source, "grok");
  assert.match(providerPrompt, /CareLink Hospital/);
  assert.doesNotMatch(providerPrompt, /12|77/);
  assert.match(body.explanation, /stale/);
});

test("explanation model failure uses facts reloaded by the backend", async () => {
  const handler = createSmartMatchAssistHandler({
    authorize: async () => ({ authorized: true, user: { id: "p1" } }),
    loadHospitalMatchFacts: async () => ({ name: "CareLink Hospital", score: 80, matchedResources: ["icu"], missingResources: [], travelTimeMinutes: null, status: "busy", confirmationStatus: "unconfirmed", stale: false }),
    apiKey: "secret", model: "test", fetcher: async () => { throw new Error("provider down"); },
  });
  const response = await handler(request({ message: "Explain", mode: "explain", hospitalId: "h-1", matchCriteria: { emergencyType: "cardiac", ambulanceLocation: { latitude: 12, longitude: 77 }, requiredResources: ["icu"] }, current }));
  const body = await response.json();
  assert.equal(body.source, "fallback");
  assert.match(body.explanation, /unconfirmed/);
  assert.match(body.explanation, /travel time unavailable/);
});

test("malformed JSON request receives a client error", async () => {
  const handler = createSmartMatchAssistHandler({ authorize: async () => ({ authorized: true, user: { id: "p1" } }) });
  const response = await handler(new Request("http://localhost/api/rank/assist", { method: "POST", body: "{" }));
  assert.equal(response.status, 400);
});

test("rank API schema rejects invalid coordinates and oversized requirement lists", () => {
  const base = { emergencyType: "cardiac", ambulanceLocation: { latitude: 91, longitude: 0 }, requiredResources: [] };
  assert.equal(rankRequestSchema.safeParse(base).success, false);
  assert.equal(rankRequestSchema.safeParse({ ...base, ambulanceLocation: { latitude: 12, longitude: 77 }, requiredResources: Array(21).fill("icu") }).success, false);
  assert.equal(rankRequestSchema.safeParse({ ...base, ambulanceLocation: { latitude: 12, longitude: 77 }, requiredResources: ["icu"], preferredResources: ["pediatric"] }).success, true);
});
