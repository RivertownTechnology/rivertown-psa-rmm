import { eq } from 'drizzle-orm';
import { tenants } from '@rivertown/db';
import type { Database } from '@rivertown/db';

// The API container has no TZ env var set, so it defaults to UTC — every
// "current hour" / "current weekday" computed with plain Date methods
// (getHours, getDay, setHours, ...) is therefore in UTC, not in whatever
// timezone the business actually operates in. This module is the one place
// that resolves "what time is it for this tenant" — everything doing
// business-hours math (SLA due dates, recurring tickets, workflow gating)
// should go through it instead of calling Date methods directly.

export const DEFAULT_TIMEZONE = 'America/New_York';

export async function getTenantTimezone(db: Database, tenantId: string): Promise<string> {
  const [tenant] = await db.select({ timezone: tenants.timezone }).from(tenants)
    .where(eq(tenants.id, tenantId)).limit(1);
  return tenant?.timezone || DEFAULT_TIMEZONE;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday ... 6 = Saturday, matching Date#getDay()
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// Decomposes a UTC instant into its wall-clock components as observed in
// `timeZone` (e.g. what hour/weekday it is in America/New_York right now).
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short',
  });

  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24, // ICU can emit "24" for midnight under h23
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

// The zone's UTC offset in minutes at the given instant (positive east of UTC).
function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUTC - date.getTime()) / 60_000;
}

// Converts wall-clock components as they'd read on a clock in `timeZone` into
// the UTC instant they correspond to (DST-aware). E.g.
// zonedTimeToUtc(2026, 8, 10, 8, 0, 0, 'America/New_York') is the UTC Date
// for "8:00am Eastern on Aug 10, 2026".
export function zonedTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset1 = getTimeZoneOffsetMinutes(guess, timeZone);
  let corrected = new Date(guess.getTime() - offset1 * 60_000);
  // Re-check right at DST transition boundaries, where the offset at the
  // corrected instant can differ from the offset at the initial guess.
  const offset2 = getTimeZoneOffsetMinutes(corrected, timeZone);
  if (offset2 !== offset1) {
    corrected = new Date(guess.getTime() - offset2 * 60_000);
  }
  return corrected;
}

// Pure calendar-date arithmetic (Y/M/D only, no timezone involved) — adds
// `delta` days to a Y-M-D triple, handling month/year rollover.
export function addCalendarDays(year: number, month: number, day: number, delta: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + delta);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// Parses `YYYY-MM-DD` request-query date-range params into UTC instant
// boundaries covering the full day(s) as observed in `timeZone` — so a
// report requested for "Aug 1 to Aug 8" covers Eastern-time Aug 1 through
// Aug 8, not UTC calendar days shifted by several hours. `end` is an
// EXCLUSIVE upper bound (start of the day after `endDate`) — compare with
// `lt`, not `lte`.
export function parseTenantDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  timeZone: string,
): { start?: Date; end?: Date } {
  const result: { start?: Date; end?: Date } = {};
  if (startDate) {
    const [y, m, d] = startDate.split('-').map(Number);
    result.start = zonedTimeToUtc(y, m, d, 0, 0, 0, timeZone);
  }
  if (endDate) {
    const [y, m, d] = endDate.split('-').map(Number);
    const next = addCalendarDays(y, m, d, 1);
    result.end = zonedTimeToUtc(next.year, next.month, next.day, 0, 0, 0, timeZone);
  }
  return result;
}

// The UTC instant for midnight, today, in `timeZone` — for comparing against
// date-only fields (like an invoice due date) on a like-for-like basis.
export function tenantTodayMidnightUtc(timeZone: string, now: Date = new Date()): Date {
  const parts = getZonedParts(now, timeZone);
  return zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, timeZone);
}

// Parses a bare `YYYY-MM-DD` (no time component) as midnight in `timeZone`,
// for comparing date-only DB columns (e.g. invoices.dueDate) against a
// tenant-local "now".
export function parseDateOnlyInZone(dateStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return zonedTimeToUtc(y, m, d, 0, 0, 0, timeZone);
}
