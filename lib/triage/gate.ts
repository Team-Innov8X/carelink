import type { TriageResponse } from './schema.ts';

export type TriageIntent = 'greeting' | 'off_topic' | 'unclear' | 'symptoms';
export type GateResult = { intent: TriageIntent; redFlag: boolean; certain: boolean };

const greetings = /^(?:hi|hello|hey|good morning|good afternoon|good evening|how are you|thanks|thank you|okay|ok)[!.?\s]*$/i;
const injection = /\b(?:ignore|disregard|override|forget)\b.{0,60}\b(?:instructions?|rules?|prompts?)\b/i;
const offTopic = /\b(?:capital of|write (?:a |an )?(?:code|program|poem|story|function)|python function|tell me (?:a )?joke|who won (?:the |last )?(?:match|game)|weather in|stock price|solve this equation)\b/i;
const healthTerms = /\b(?:pain|ache|fever|cough|cold|breath(?:e|ing)?|shortness of breath|headache|migraine|dizz(?:y|iness)|nausea|vomit(?:ing)?|diarrh(?:ea|oea)|rash|itch(?:ing)?|bleed(?:ing)?|injur(?:y|ed)|burn|swelling|swell|weakness|numb(?:ness)?|sore throat|chest|stomach|abdomen|back|head|face|arm|leg|eye|ear|throat|heart|skin|tooth|pregnan(?:t|cy)|symptom|unwell|sick|ill|blood pressure|faint(?:ed|ing)?|seizure)\b/i;
const redFlags = [
  /\bchest pain\b/i,
  /\b(?:sudden|severe|worst) (?:headache|head pain)\b/i,
  /\bsevere (?:stomach|abdominal|abdomen) pain\b/i,
  /\b(?:can't|cannot|unable to|struggling to|difficulty|trouble) breathe\b/i,
  /\b(?:difficulty|trouble) breathing\b/i,
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

export function isMessageTooLong(message: string, limit: number) {
  return message.length > limit;
}

export const INTENT_REPLIES: Record<Exclude<TriageIntent, 'symptoms'>, string> = {
  greeting: 'Hello! What symptoms are you having today?',
  off_topic: "I can only help with health symptoms, so I can't answer that here. Tell me what symptoms you're having and I'll help.",
  unclear: 'Please describe your symptoms in a sentence, including when they started.',
};

export function fallbackReply(redFlag: boolean, emergencyText: string, message = '', alreadyAskedFollowUp = false): TriageResponse {
  if (redFlag) {
    return {
      intent: 'symptoms', severity: 'emergency',
      reply: `The symptoms you described may need urgent attention. ${emergencyText} This is guidance, not a medical diagnosis.`,
      nextSteps: ['Seek emergency care now'],
      followUpQuestion: null,
      suggestedSpecialty: null,
    };
  }

  const text = message.toLowerCase();
  let guidance: Pick<TriageResponse, 'severity' | 'reply' | 'nextSteps' | 'followUpQuestion' | 'suggestedSpecialty'>;
  if (/\b(?:headache|migraine|head pain)\b/.test(text)) {
    guidance = {
      severity: 'self_care',
      reply: 'You reported a headache. If it is mild, rest somewhere quiet, drink water, and monitor how it changes. Seek medical advice if it gets worse, keeps returning, or does not improve.',
      nextSteps: ['Rest in a quiet place', 'Drink water and monitor the pain', 'Seek care if it worsens or persists'],
      followUpQuestion: 'When did it start, and has it been getting worse?',
      suggestedSpecialty: null,
    };
  } else if (/\b(?:stomach|abdominal|abdomen) pain\b/.test(text)) {
    guidance = {
      severity: 'see_doctor',
      reply: 'You reported stomach pain, which can have many causes and cannot be assessed reliably from this message alone. Contact a healthcare professional if it persists or worsens, and seek urgent care for severe pain.',
      nextSteps: ['Note where the pain is and when it started', 'Contact a healthcare professional if it persists or worsens'],
      followUpQuestion: 'Where is the pain, and when did it begin?',
      suggestedSpecialty: 'General physician',
    };
  } else if (/\b(?:fever|cough|cold|sore throat)\b/.test(text)) {
    guidance = {
      severity: 'self_care',
      reply: 'You reported fever or respiratory symptoms. Rest, drink fluids, and keep track of how long the symptoms last and whether they worsen. Contact a healthcare professional if they are severe, persistent, or getting worse.',
      nextSteps: ['Rest and drink fluids', 'Monitor your temperature and symptoms', 'Contact a clinician if symptoms worsen or persist'],
      followUpQuestion: 'How long have you had these symptoms?',
      suggestedSpecialty: null,
    };
  } else if (/\b(?:rash|itch(?:y|ing)?)\b/.test(text)) {
    guidance = {
      severity: 'see_doctor',
      reply: 'You reported a rash or itching. I cannot tell its cause from this message, so arrange medical advice if it spreads, persists, or becomes painful. Seek urgent help if you also have trouble breathing or sudden swelling.',
      nextSteps: ['Note when it started and whether it is spreading', 'Contact a healthcare professional if it persists or worsens'],
      followUpQuestion: 'When did the rash or itching start, and is it spreading?',
      suggestedSpecialty: 'General physician',
    };
  } else {
    guidance = {
      severity: 'see_doctor',
      reply: 'You reported symptoms that I cannot assess reliably from the details provided. Contact a healthcare professional for guidance, especially if the symptoms persist or worsen. Seek urgent help if they become severe.',
      nextSteps: ['Contact a healthcare professional', 'Note when the symptoms started and whether they are changing'],
      followUpQuestion: 'When did the symptoms start, and are they getting worse?',
      suggestedSpecialty: 'General physician',
    };
  }

  return {
    intent: 'symptoms',
    ...guidance,
    reply: `${alreadyAskedFollowUp ? 'Thanks for the additional detail. ' : ''}${guidance.reply} This is guidance, not a medical diagnosis.`,
    followUpQuestion: alreadyAskedFollowUp ? null : guidance.followUpQuestion,
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
  const escapedEmergencyText = emergencyText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withoutDiagnosisNote = reply
    .replace(new RegExp(escapedEmergencyText, 'gi'), ' ')
    .replace(/\s*This is guidance, not a medical diagnosis\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const body = `${withoutDiagnosisNote} ${emergencyText}`.trim();
  return `${body} This is guidance, not a medical diagnosis.`;
}
