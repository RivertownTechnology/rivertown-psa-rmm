import { describe, it, expect } from 'vitest';
import { getZonedParts, zonedTimeToUtc, addCalendarDays, parseTenantDateRange, tenantTodayMidnightUtc, parseDateOnlyInZone } from './timezone.js';

describe('getZonedParts', () => {
  it('decomposes a UTC instant into Eastern wall-clock components (EDT)', () => {
    // 2:12pm EDT on Sat Aug 8 2026 == 18:12 UTC
    const parts = getZonedParts(new Date('2026-08-08T18:12:00.000Z'), 'America/New_York');
    expect(parts).toMatchObject({ year: 2026, month: 8, day: 8, hour: 14, minute: 12, weekday: 6 });
  });

  it('decomposes a UTC instant into Eastern wall-clock components (EST, winter)', () => {
    // 8:00am EST on Thu Jan 15 2026 == 13:00 UTC
    const parts = getZonedParts(new Date('2026-01-15T13:00:00.000Z'), 'America/New_York');
    expect(parts).toMatchObject({ year: 2026, month: 1, day: 15, hour: 8, minute: 0, weekday: 4 });
  });
});

describe('zonedTimeToUtc', () => {
  it('converts 8am Eastern (EDT) to the correct UTC instant', () => {
    const result = zonedTimeToUtc(2026, 8, 10, 8, 0, 0, 'America/New_York');
    expect(result.toISOString()).toBe('2026-08-10T12:00:00.000Z');
  });

  it('converts 8am Eastern (EST, winter) to the correct UTC instant', () => {
    const result = zonedTimeToUtc(2026, 1, 15, 8, 0, 0, 'America/New_York');
    expect(result.toISOString()).toBe('2026-01-15T13:00:00.000Z');
  });

  it('round-trips through getZonedParts', () => {
    const utc = zonedTimeToUtc(2026, 3, 3, 9, 30, 0, 'America/New_York');
    const parts = getZonedParts(utc, 'America/New_York');
    expect(parts).toMatchObject({ year: 2026, month: 3, day: 3, hour: 9, minute: 30 });
  });
});

describe('addCalendarDays', () => {
  it('rolls over month boundaries', () => {
    expect(addCalendarDays(2026, 8, 31, 1)).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it('rolls over year boundaries', () => {
    expect(addCalendarDays(2026, 12, 31, 1)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it('handles negative deltas', () => {
    expect(addCalendarDays(2026, 3, 1, -1)).toEqual({ year: 2026, month: 2, day: 28 });
  });
});

describe('parseTenantDateRange', () => {
  it('covers the full Eastern-time day, not the UTC calendar day', () => {
    const { start, end } = parseTenantDateRange('2026-08-01', '2026-08-08', 'America/New_York');
    // Aug 1 00:00 Eastern (EDT) == Aug 1 04:00 UTC — NOT Aug 1 00:00 UTC
    expect(start?.toISOString()).toBe('2026-08-01T04:00:00.000Z');
    // Exclusive upper bound: Aug 9 00:00 Eastern == Aug 9 04:00 UTC
    expect(end?.toISOString()).toBe('2026-08-09T04:00:00.000Z');
  });

  it('returns undefined bounds when not provided', () => {
    const { start, end } = parseTenantDateRange(undefined, undefined, 'America/New_York');
    expect(start).toBeUndefined();
    expect(end).toBeUndefined();
  });
});

describe('tenantTodayMidnightUtc', () => {
  it('resolves to Eastern midnight, not UTC midnight, for a late-evening Eastern instant', () => {
    // 11pm Eastern on Aug 8 == 03:00 UTC Aug 9 (still "Aug 8" in Eastern)
    const now = new Date('2026-08-09T03:00:00.000Z');
    const result = tenantTodayMidnightUtc('America/New_York', now);
    expect(result.toISOString()).toBe('2026-08-08T04:00:00.000Z');
  });
});

describe('parseDateOnlyInZone', () => {
  it('parses a bare date as Eastern midnight, not UTC midnight', () => {
    const result = parseDateOnlyInZone('2026-08-15', 'America/New_York');
    expect(result.toISOString()).toBe('2026-08-15T04:00:00.000Z');
  });
});
