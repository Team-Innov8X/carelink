import type { TriageResponse } from './schema.ts';

export type TriageIntent = 'greeting' | 'off_topic' | 'unclear' | 'symptoms';
export type GateResult = { intent: TriageIntent; redFlag: boolean; certain: boolean };

const greetings = /^(?:hi|hello|hey|good morning|good afternoon|good evening|how are you|thanks|thank you|okay|ok)[!.\s]*$/i;
const injection = /\b(?:ignore|disregard|override|forget)\b.{0,60}\b(?:instructions?|rules?|prompts?)\b/i;
const offTopic = /\b(?:capital of|write (?:a |an )?(?:code|program|poem|story|function)|python function|tell me (?:a )?joke|who won (?:the |last )?(?:match|game)|weather in|stock price|solve this equation)\b/i;
const healthTerms = /\b(?:pain|ache|fever|cough|cold|breath(?:e|ing)?|shortness of breath|headache|migraine|dizz(?:y|iness)|nausea|vomit(?:ing)?|diarrh(?:ea|oea)|rash|itch(?:ing)?|bleed(?:ing)?|injur(?:y|ed)|burn|swelling|swell|weakness|numb(?:ness)?|sore throat|chest|stomach|abdomen|back|head|face|arm|leg|eye|ear|throat|heart|skin|tooth|pregnan(?:t|cy)|symptom|unwell|sick|ill|blood pressure|faint(?:ed|ing)?|seizure)\b/i;
const redFlags = [
  /\bchest pain\b/i,
  /\b(?:can't|cannot|unable to|struggling to|difficulty) breathe\b/i,
  /\bshortness of breath\b/i,
  /\b(?:face drooping|slurred speech|sudden weakness on one side|stroke signs?)\b/i,
  /\bsevere (?:bleeding|blood loss)\b/i,
  /\bbleeding (?:won't|will not|doesn't|does not) stop\b/i,
  /\b(?:lost|loss of) consciousness\b/i,
  /\b(?:suicidal thoughts?|want to kill myself|self[- ]harm)\b/i,
];

function negated(text: string, matchIndex: number) {
  return /\b(?:no|not|never|without|denies|don't have|do not have)\b(?:\W+\w+){0,3}\W*$/i.test(text.slice(Math.max(0, matchIndex - 40), matchIndex));
}

export function detectRedFlag(message: string) {
  return redFlags.some((pattern) => {
    const match = pattern.exec(message);
    return Boolean(match && !negated(message, match.index));
  });
}

export function classifyMessage(message: string): GateResult {
  const text = message.trim();
  if (!text) return { intent: 'unclear', redFlag: false, certain: true };
  if (injection.test(text) && /\b(?:joke|poem|story|code|capital|match)\b/i.test(text)) return { intent: 'off_topic', redFlag: false, certain: true };
  if (greetings.test(text)) return { intent: 'greeting', redFlag: false, certain: true };
  if (text.length < 3 || !/[a-z]/i.test(text) || /^[\W_\d]+$/.test(text)) return { intent: 'unclear', redFlag: false, certain: true };
  const redFlag = detectRedFlag(text);
  if (redFlag) return { intent: 'symptoms', redFlag: true, certain: true };
  if (healthTerms.test(text)) return { intent: 'symptoms', redFlag: false, certain: true };
  if (offTopic.test(text)) return { intent: 'off_topic', redFlag: false, certain: true };
  if (text.length > 400 || /\?/.test(text) || text.split(/\s+/).length > 12) return { intent: 'off_topic', redFlag: false, certain: true };
  if (text.split(/\s+/).length <= 2) return { intent: 'unclear', redFlag: false, certain: true };
  return { intent: 'unclear', redFlag: false, certain: false };
}

export const INTENT_REPLIES: Record<Exclude<TriageIntent, 'symptoms'>, string> = {
  greeting: 'Hello! What symptoms are you having today?',
  off_topic: "I can only help with health symptoms, so I can't answer that here. Tell me what symptoms you're having and I'll help.",
  unclear: 'Please describe your symptoms in a sentence, including when they started.',
};

export function fallbackReply(redFlag: boolean, emergencyText: string): TriageResponse {
  const severity = redFlag ? 'emergency' : 'see_doctor';
  return {
    intent: 'symptoms', severity,
    reply: redFlag
      ? `Your symptoms may need urgent attention. ${emergencyText} This is guidance, not a medical diagnosis.`
      : 'I could not assess this reliably. Please contact a healthcare professional for guidance. This is guidance, not a medical diagnosis.',
    nextSteps: redFlag ? ['Seek emergency care now'] : ['Contact a healthcare professional', 'Seek urgent help if symptoms become severe'],
    followUpQuestion: null,
    suggestedSpecialty: null,
  };
}

export function applyEmergencyOverride(output: TriageResponse, emergencyText: string): TriageResponse {
  if (output.severity === 'emergency') return { ...output, reply: ensureEmergencySentence(output.reply, emergencyText) };
  return output;
}

export function applyRedFlagOverride(output: TriageResponse, emergencyText: string): TriageResponse {
  return { ...output, severity: 'emergency', nextSteps: ['Seek emergency care now'], followUpQuestion: null, reply: ensureEmergencySentence(output.reply, emergencyText) };
}

export function ensureEmergencySentence(reply: string, emergencyText: string) {
  const withoutDiagnosisNote = reply.replace(/\s*This is guidance, not a medical diagnosis\.?/i, '').trim();
  const body = withoutDiagnosisNote.includes(emergencyText) ? withoutDiagnosisNote : `${withoutDiagnosisNote} ${emergencyText}`;
  return `${body} This is guidance, not a medical diagnosis.`;
}
