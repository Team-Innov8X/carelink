export const MAX_MESSAGE_CHARS = 1000;
export const MAX_FOLLOW_UPS = 3;
export const MAX_HISTORY_TURNS = 8;
export const TRIAGE_RATE_LIMIT = { limit: 20, windowMs: 5 * 60_000 } as const;
export const SPECIALTIES = ['General physician', 'Cardiologist', 'Neurologist', 'Pulmonologist', 'Gastroenterologist'] as const;
export const QUICK_START_CHIPS = [
  { label: 'Fever and cough', message: 'I have fever and cough for 3 days' },
  { label: 'Headache', message: 'I have had a headache since this morning' },
  { label: 'Stomach pain', message: 'I have stomach pain' },
  { label: 'Chest pain', message: 'I have chest pain' },
];
export { EMERGENCY_FALLBACK_TEXT } from '../dispatch/constants.ts';
