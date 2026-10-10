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
