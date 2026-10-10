export type EmergencyLevel = 'HIGH EMERGENCY' | 'URGENT' | 'NORMAL';

export function classifyEmergencyLevel(description: string): EmergencyLevel {
  const normalized = description.toLocaleLowerCase();
  if (/cardiac|heart attack|severe bleeding|unconscious|critical trauma|major accident|road accident|accident|stroke|not breathing|respiratory distress|severe asthma|acute asthma/.test(normalized)) return 'HIGH EMERGENCY';
  if (/moderate injury|severe pain|complicated|urgent|fracture|breathing difficulty|shortness of breath/.test(normalized)) return 'URGENT';
  return 'NORMAL';
}

export function EmergencyLevelTag({ description }: { description: string }) {
  const level = classifyEmergencyLevel(description);
  const tone = level === 'HIGH EMERGENCY' ? 'text-rose-700' : level === 'URGENT' ? 'text-amber-700' : 'text-emerald-700';
  return <span className={`text-xs ${tone}`}>{level}</span>;
}
