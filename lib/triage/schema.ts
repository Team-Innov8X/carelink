import { z } from 'zod';
import { SPECIALTIES } from './constants.ts';

export const triageResponseSchema = z.object({
  intent: z.literal('symptoms'),
  severity: z.enum(['self_care', 'see_doctor', 'urgent_care', 'emergency']),
  reply: z.string().trim().min(1).max(1200),
  nextSteps: z.array(z.string().trim().min(1).max(180)).max(3),
  followUpQuestion: z.string().trim().max(240).nullable(),
  suggestedSpecialty: z.enum(SPECIALTIES).nullable(),
}).superRefine((value, context) => {
  const unsafeDose = /\b(?:take|use|start|stop|increase|decrease)\s+(?:[a-z-]+\s+){0,4}\d+\s*(?:mg|mcg|ml|tablets?|capsules?|doses?)\b/i;
  const diagnosticClaim = /\b(?:diagnosed with|you have (?:pneumonia|appendicitis|a heart attack|a stroke|covid|influenza))\b/i;
  if (unsafeDose.test(value.reply) || value.nextSteps.some((step) => unsafeDose.test(step))) {
    context.addIssue({ code: 'custom', path: ['reply'], message: 'Triage replies cannot prescribe medicine or doses.' });
  }
  if (diagnosticClaim.test(value.reply)) {
    context.addIssue({ code: 'custom', path: ['reply'], message: 'Triage replies cannot state a diagnosis.' });
  }
});

export type TriageResponse = z.infer<typeof triageResponseSchema>;
export type TriageMessage = { role: 'system' | 'user' | 'assistant'; content: string; followUpQuestion?: string | null };

export const intentResponseSchema = z.object({ intent: z.enum(['greeting', 'off_topic', 'unclear', 'symptoms']) });
