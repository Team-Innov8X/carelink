import type { TriageOutput } from './ai.ts';
import { TRIAGE_OFF_TOPIC_REPLY } from './triage-config.ts';

export const TRIAGE_SHORT_MESSAGE_REPLY = 'What symptoms are you having?';
export const TRIAGE_INJECTION_PATTERN = /\b(ignore|disregard|override|forget)\b.{0,40}\b(instructions?|rules?|prompts?)\b|\b(act|behave|pretend)\s+as\b/i;

export function isPromptInjection(message: string) {
  return TRIAGE_INJECTION_PATTERN.test(message);
}

export function normalizeTriageOutput(output: TriageOutput, followUpCount: number, promptInjection: boolean): TriageOutput {
  if (!output.relevant || promptInjection) {
    return { relevant: false, reply: TRIAGE_OFF_TOPIC_REPLY, urgency: 'assessing', category: null, suggestions: [], shouldEscalate: false };
  }

  const forcedResult = followUpCount >= 2 && output.urgency === 'assessing';
  const urgency = forcedResult ? 'moderate' : output.urgency;
  const category = forcedResult ? 'other' : output.category;
  const shouldEscalate = urgency === 'critical' || urgency === 'high';
  const suggestions = urgency === 'assessing' ? [] : ['Find nearby hospitals', 'Book a routine driver', ...(shouldEscalate ? ['Send SOS'] : [])];
  const reply = sanitizeHealthText(output.reply).text.trim();

  return {
    ...output,
    reply,
    relevant: true,
    urgency,
    category,
    shouldEscalate,
    suggestions: suggestions.slice(0, 3),
    ...(forcedResult ? { reply: 'Based on what you have shared, consider contacting a healthcare professional for an assessment. Guidance only, not a diagnosis.' } : {}),
  };
}

export function sanitizeHealthText(input: string) {
  const ageMatch = input.match(/\b(?:i am|i'm|age\s*:?|aged)\s*(\d{1,3})\s*(?:years?\s*old)?\b/i);
  const age = ageMatch ? Number(ageMatch[1]) : undefined;
  const text = input
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:my address is|i live at|we live at|located at|address\s*:)\s*[^,;.!?]+/gi, '[address removed]')
    .replace(/\b(?:my name is|this is)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g, '[name removed]')
    .replace(/\b(?:i am|i'm|call me)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?=\s*(?:,|and|with|;|\.|$))/g, '[name removed]')
    .replace(/\b(?:my\s+(?:child|daughter|son|mother|father|wife|husband|sister|brother)\s+)[A-Z][a-z]+\b/g, '[relative name removed]')
    .replace(/\b\d{1,6}[A-Za-z]?\s+(?:[\w.'-]+\s+){0,4}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|apartment|apt|flat|block)\b[^,.;]*/gi, '[address removed]')
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, '[phone removed]')
    .replace(/\b(?:i am|i'm|age\s*:?|aged)\s*\d{1,3}\s*(?:years?\s*old)?\b/gi, '');
  return { text, age: age !== undefined && age >= 0 && age <= 120 ? age : undefined };
}
