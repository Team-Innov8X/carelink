import { z } from 'zod';
import { SPECIALTIES } from './constants.ts';

export const triageResponseSchema = z.object({
  intent: z.literal('symptoms'),
  severity: z.enum(['self_care', 'see_doctor', 'urgent_care', 'emergency']),
  reply: z.string().trim().min(1).max(1200),
  nextSteps: z.array(z.string().trim().min(1).max(180)).max(3),
  followUpQuestion: z.string().trim().max(240).nullable(),
  suggestedSpecialty: z.enum(SPECIALTIES).nullable(),
});

export type TriageResponse = z.infer<typeof triageResponseSchema>;
export type TriageMessage = { role: 'system' | 'user' | 'assistant'; content: string; followUpQuestion?: string | null };

export const intentResponseSchema = z.object({ intent: z.enum(['greeting', 'off_topic', 'unclear', 'symptoms']) });
