/** The moment `days` days ago. Kept in a helper so pages can ask for "the last N days" without reading the clock themselves. */
export function daysAgo(days: number, now: number = Date.now()): Date {
  return new Date(now - days * 86_400_000);
}
