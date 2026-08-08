import { describe, it, expect } from 'vitest';
import { customers, slaPolicies, tenants } from '@rivertown/db';
import { calculateSla } from './sla-calculator.js';

const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'customer-1';

function createMockDb(policy: Record<string, unknown>, timezone = 'America/New_York') {
  const customerRow = { slaPolicyId: 'policy-1' };
  const tenantRow = { timezone };

  return {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => {
            if (table === customers) return Promise.resolve([customerRow]);
            if (table === slaPolicies) return Promise.resolve([policy]);
            if (table === tenants) return Promise.resolve([tenantRow]);
            return Promise.resolve([]);
          },
        }),
      }),
    }),
  };
}

const BUSINESS_HOURS_POLICY = {
  id: 'policy-1',
  name: 'Standard',
  isActive: true,
  businessHoursEnabled: true,
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
  businessDays: '1,2,3,4,5', // Mon-Fri
  holidays: [],
  mediumResponseMinutes: 60,
  mediumResolutionMinutes: 480,
};

describe('calculateSla — business hours (America/New_York)', () => {
  it('treats a 2:12pm Eastern ticket as created DURING business hours, not after them', async () => {
    // This is the exact bug scenario: 2:12pm EDT == 18:12 UTC. The old
    // UTC-naive code saw 18:12 >= "17:00" and incorrectly treated it as
    // after-hours, pushing the due date to the next business day.
    const createdAt = new Date('2026-08-10T18:12:00.000Z'); // Mon 2:12pm EDT
    const db = createMockDb(BUSINESS_HOURS_POLICY);

    const result = await calculateSla(db as any, TENANT_ID, CUSTOMER_ID, 'medium', createdAt);

    // 60 response minutes from 2:12pm Eastern (within 9-5) == 3:12pm Eastern same day == 19:12 UTC
    expect(result.slaResponseDueAt?.toISOString()).toBe('2026-08-10T19:12:00.000Z');
  });

  it('rolls a ticket created after business hours to next business day 9am Eastern', async () => {
    // 8:00pm Eastern on Monday Aug 10 2026 == 00:00 UTC Aug 11
    const createdAt = new Date('2026-08-11T00:00:00.000Z');
    const db = createMockDb(BUSINESS_HOURS_POLICY);

    const result = await calculateSla(db as any, TENANT_ID, CUSTOMER_ID, 'medium', createdAt);

    // Next business day is Tue Aug 11; 9am EDT == 13:00 UTC; +60 min response == 14:00 UTC
    expect(result.slaResponseDueAt?.toISOString()).toBe('2026-08-11T14:00:00.000Z');
  });

  it('rolls a Friday-evening ticket over the weekend to Monday', async () => {
    // Friday Aug 7 2026, 8pm Eastern == Sat Aug 8 00:00 UTC
    const createdAt = new Date('2026-08-08T00:00:00.000Z');
    const db = createMockDb(BUSINESS_HOURS_POLICY);

    const result = await calculateSla(db as any, TENANT_ID, CUSTOMER_ID, 'medium', createdAt);

    // Next business day is Monday Aug 10; 9am EDT == 13:00 UTC; +60 min == 14:00 UTC
    expect(result.slaResponseDueAt?.toISOString()).toBe('2026-08-10T14:00:00.000Z');
  });

  it('respects a non-Eastern tenant timezone', async () => {
    // 2:12pm Pacific (PDT, UTC-7) on Mon Aug 10 2026 == 21:12 UTC
    const createdAt = new Date('2026-08-10T21:12:00.000Z');
    const db = createMockDb(BUSINESS_HOURS_POLICY, 'America/Los_Angeles');

    const result = await calculateSla(db as any, TENANT_ID, CUSTOMER_ID, 'medium', createdAt);

    // 60 min from 2:12pm Pacific == 3:12pm Pacific same day == 22:12 UTC
    expect(result.slaResponseDueAt?.toISOString()).toBe('2026-08-10T22:12:00.000Z');
  });
});

describe('calculateSla — linear (business hours disabled)', () => {
  it('adds minutes directly regardless of timezone', async () => {
    const policy = { ...BUSINESS_HOURS_POLICY, businessHoursEnabled: false };
    const createdAt = new Date('2026-08-10T18:12:00.000Z');
    const db = createMockDb(policy);

    const result = await calculateSla(db as any, TENANT_ID, CUSTOMER_ID, 'medium', createdAt);

    expect(result.slaResponseDueAt?.toISOString()).toBe('2026-08-10T19:12:00.000Z');
  });
});
