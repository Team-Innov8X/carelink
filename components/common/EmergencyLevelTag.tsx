export type EmergencyLevel = 'HIGH EMERGENCY' | 'URGENT' | 'NORMAL';

export function classifyEmergencyLevel(description: string): EmergencyLevel {
  const normalized = description.toLocaleLowerCase();
  if (/cardiac|heart attack|severe bleeding|unconscious|critical trauma|major accident|road accident|accident|stroke|not breathing|respiratory distress|severe asthma|acute asthma/.test(normalized)) return 'HIGH EMERGENCY';
  if (/moderate injury|severe pain|complicated|urgent|fracture|breathing difficulty|shortness of breath/.test(normalized)) return 'URGENT';
  return 'NORMAL';
}

export function EmergencyLevelTag({ description }: { description: string }) {
  const level = classifyEmergencyLevel(description);
  const tone = level === 'HIGH EMERGENCY' ? 'bg-rose-100 text-rose-800' : level === 'URGENT' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${tone}`}>{level}</span>;
}
