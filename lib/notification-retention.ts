export function notificationCutoff(now: Date, ttlHours: number): Date {
  const safeHours = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24;
  return new Date(now.getTime() - safeHours * 60 * 60 * 1000);
}
