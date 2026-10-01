/**
 * Single source of truth for calendar-day handling.
 *
 * Day buckets are UTC. The audit host may sit in any timezone (this one is
 * Asia/Tokyo), and roughly an eighth of the stored runs happen between 01:00
 * and 08:00 local, so their UTC day differs from their local day. Bucketing,
 * the Excel test date, the zip file name and the dashboard's own date labels
 * must all agree, otherwise the same run appears under two different days.
 */

const MS_PER_DAY = 86_400_000;

/** UTC calendar day of a timestamp, as YYYY-MM-DD. */
export function utcDayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** UTC calendar day parsed back to epoch ms, for day-axis positioning. */
export function utcDayStartMs(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`);
}

/** YYYY-MM-DD in UTC. */
export function formatUtcDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export { MS_PER_DAY };
