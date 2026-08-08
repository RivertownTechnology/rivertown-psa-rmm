import { describe, it, expect } from 'vitest';
import { calculateNextRecurringRun } from './recurrence.js';

const TZ = 'America/New_York';

describe('calculateNextRecurringRun', () => {
  it('daily: schedules 8am Eastern tomorrow, not 8am UTC', () => {
    // "now" = Sat Aug 8 2026, 2:12pm EDT (18:12 UTC)
    const now = new Date('2026-08-08T18:12:00.000Z');
    const next = calculateNextRecurringRun('daily', null, null, TZ, now);
    // 8am EDT on Aug 9 == 12:00 UTC
    expect(next.toISOString()).toBe('2026-08-09T12:00:00.000Z');
  });

  it('weekly: rolls forward to the target weekday at 8am Eastern', () => {
    // now = Sat Aug 8 2026 (weekday 6); target = Monday (1)
    const now = new Date('2026-08-08T18:12:00.000Z');
    const next = calculateNextRecurringRun('weekly', 1, null, TZ, now);
    // Next Monday is Aug 10 2026; 8am EDT == 12:00 UTC
    expect(next.toISOString()).toBe('2026-08-10T12:00:00.000Z');
  });

  it('weekly: wraps to next week when target day already passed this week', () => {
    // now = Wed (weekday 3); target = Monday (1) -> should be +5 days, not negative
    const now = new Date('2026-08-05T18:12:00.000Z'); // Wed Aug 5 2026
    const next = calculateNextRecurringRun('weekly', 1, null, TZ, now);
    expect(next.toISOString()).toBe('2026-08-10T12:00:00.000Z'); // next Monday
  });

  it('monthly: clamps to the shorter month length and rolls year boundary', () => {
    // now = Dec 31 2026; target day 31 -> Feb 2027 has 28 days, clamp to 28
    const now = new Date('2026-12-31T18:12:00.000Z');
    const next = calculateNextRecurringRun('monthly', null, 31, TZ, now);
    // Next month from Dec is Jan 2027 (31 days) -> day 31 -> 8am EST == 13:00 UTC
    expect(next.toISOString()).toBe('2027-01-31T13:00:00.000Z');
  });

  it('produces a time that reads as 8:00am when viewed in the tenant timezone', () => {
    const now = new Date('2026-08-08T18:12:00.000Z');
    const next = calculateNextRecurringRun('daily', null, null, TZ, now);
    const local = next.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
    expect(local).toBe('8:00 AM');
  });
});
