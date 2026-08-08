import { addCalendarDays, getZonedParts, zonedTimeToUtc } from './timezone.js';

// Recurring tickets always fire at 8am in the tenant's own timezone, not
// 8am container-local (which is UTC — see timezone.ts).
const RUN_HOUR = 8;

export function calculateNextRecurringRun(
  frequency: string,
  dayOfWeek: number | null | undefined,
  dayOfMonth: number | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): Date {
  const nowParts = getZonedParts(now, timeZone);

  switch (frequency) {
    case 'daily': {
      const { year, month, day } = addCalendarDays(nowParts.year, nowParts.month, nowParts.day, 1);
      return zonedTimeToUtc(year, month, day, RUN_HOUR, 0, 0, timeZone);
    }
    case 'weekly': {
      const targetDay = dayOfWeek ?? 1; // Default Monday
      let daysUntil = targetDay - nowParts.weekday;
      if (daysUntil <= 0) daysUntil += 7;
      const { year, month, day } = addCalendarDays(nowParts.year, nowParts.month, nowParts.day, daysUntil);
      return zonedTimeToUtc(year, month, day, RUN_HOUR, 0, 0, timeZone);
    }
    case 'monthly': {
      const targetDay = dayOfMonth ?? 1;
      let nextMonth = nowParts.month + 1;
      let nextYear = nowParts.year;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
      const day = Math.min(targetDay, daysInNextMonth);
      return zonedTimeToUtc(nextYear, nextMonth, day, RUN_HOUR, 0, 0, timeZone);
    }
    default: {
      const { year, month, day } = addCalendarDays(nowParts.year, nowParts.month, nowParts.day, 1);
      return zonedTimeToUtc(year, month, day, RUN_HOUR, 0, 0, timeZone);
    }
  }
}
