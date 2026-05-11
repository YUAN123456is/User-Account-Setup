/**
 * Timezone utilities — all "business date" logic uses UTC-8 (US Pacific Standard Time).
 * Timestamps stored in DB stay as UTC; only date strings shown to users use UTC-8.
 */

const OFFSET_MS = -8 * 60 * 60 * 1000; // UTC-8

/** Returns a Date whose UTC fields represent the current UTC-8 wall-clock time. */
export function nowUTC8(): Date {
  return new Date(Date.now() + OFFSET_MS);
}

/** "Today" as a YYYY-MM-DD string in UTC-8. */
export function todayUTC8(): string {
  return nowUTC8().toISOString().slice(0, 10);
}

/** "Yesterday" as a YYYY-MM-DD string in UTC-8. */
export function yesterdayUTC8(): string {
  const d = nowUTC8();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Milliseconds until the next occurrence of a given UTC-8 wall-clock hour (0–23).
 * e.g. msUntilHourUTC8(2) → ms until next 02:00 UTC-8 (= 10:00 UTC).
 */
export function msUntilHourUTC8(hour: number): number {
  const now = new Date();
  // Target = today at `hour`:00:00 UTC-8 = (hour+8):00:00 UTC
  const utcHour = (hour + 8) % 24;
  const next = new Date();
  next.setUTCHours(utcHour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}
