import { eq, and } from 'drizzle-orm';
import { slaPolicies, customers } from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { addCalendarDays, getTenantTimezone, getZonedParts, zonedTimeToUtc, type ZonedParts } from '../common/timezone.js';

interface SlaResult {
  slaPolicyId: string | null;
  slaResponseDueAt: Date | null;
  slaResolutionDueAt: Date | null;
  slaDueAt: Date | null;
  policyName: string | null;
}

function isHoliday(parts: ZonedParts, holidays: string[]): boolean {
  const dateStr = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return holidays.includes(dateStr);
}

function advanceToNextBusinessStart(
  fromParts: ZonedParts,
  days: number[],
  holidays: string[],
  startH: number,
  startM: number,
  timeZone: string,
): { date: Date; parts: ZonedParts } {
  let { year, month, day } = addCalendarDays(fromParts.year, fromParts.month, fromParts.day, 1);
  let date = zonedTimeToUtc(year, month, day, startH, startM, 0, timeZone);
  let parts = getZonedParts(date, timeZone);

  while (!days.includes(parts.weekday) || isHoliday(parts, holidays)) {
    ({ year, month, day } = addCalendarDays(parts.year, parts.month, parts.day, 1));
    date = zonedTimeToUtc(year, month, day, startH, startM, 0, timeZone);
    parts = getZonedParts(date, timeZone);
  }

  return { date, parts };
}

function addBusinessMinutes(
  start: Date,
  minutes: number,
  hoursStart: string, // "09:00"
  hoursEnd: string,   // "17:00"
  daysStr: string,    // "1,2,3,4,5"
  holidays: string[], // ["2026-12-25"]
  timeZone: string,
): Date {
  const days = daysStr.split(',').map(Number);
  const [startH, startM] = hoursStart.split(':').map(Number);
  const [endH, endM] = hoursEnd.split(':').map(Number);
  const businessEndMinute = endH * 60 + endM;
  const businessStartMinute = startH * 60 + startM;

  let remaining = minutes;
  let current = start;
  let currentParts = getZonedParts(current, timeZone);
  const currentMinuteOfDay = currentParts.hour * 60 + currentParts.minute;

  // Advance to start of next business period if outside hours
  if (
    !days.includes(currentParts.weekday) ||
    isHoliday(currentParts, holidays) ||
    currentMinuteOfDay >= businessEndMinute
  ) {
    ({ date: current, parts: currentParts } = advanceToNextBusinessStart(currentParts, days, holidays, startH, startM, timeZone));
  } else if (currentMinuteOfDay < businessStartMinute) {
    current = zonedTimeToUtc(currentParts.year, currentParts.month, currentParts.day, startH, startM, 0, timeZone);
    currentParts = getZonedParts(current, timeZone);
  }

  while (remaining > 0) {
    if (!days.includes(currentParts.weekday) || isHoliday(currentParts, holidays)) {
      const { year, month, day } = addCalendarDays(currentParts.year, currentParts.month, currentParts.day, 1);
      current = zonedTimeToUtc(year, month, day, startH, startM, 0, timeZone);
      currentParts = getZonedParts(current, timeZone);
      continue;
    }

    const currentMinute = currentParts.hour * 60 + currentParts.minute;
    const minutesLeftToday = businessEndMinute - currentMinute;

    if (remaining <= minutesLeftToday) {
      current = new Date(current.getTime() + remaining * 60_000);
      remaining = 0;
    } else {
      remaining -= minutesLeftToday;
      const { year, month, day } = addCalendarDays(currentParts.year, currentParts.month, currentParts.day, 1);
      current = zonedTimeToUtc(year, month, day, startH, startM, 0, timeZone);
      currentParts = getZonedParts(current, timeZone);
    }
  }

  return current;
}

export async function calculateSla(
  db: Database,
  tenantId: string,
  customerId: string,
  priority: string,
  createdAt: Date = new Date(),
): Promise<SlaResult> {
  // 1. Get customer's SLA policy
  const [customer] = await db.select({ slaPolicyId: customers.slaPolicyId })
    .from(customers).where(eq(customers.id, customerId)).limit(1);

  let policy: any = null;

  if (customer?.slaPolicyId) {
    const [p] = await db.select().from(slaPolicies)
      .where(and(eq(slaPolicies.id, customer.slaPolicyId), eq(slaPolicies.isActive, true))).limit(1);
    policy = p;
  }

  // 2. Fall back to tenant default
  if (!policy) {
    const [p] = await db.select().from(slaPolicies)
      .where(and(eq(slaPolicies.tenantId, tenantId), eq(slaPolicies.isDefault, true), eq(slaPolicies.isActive, true))).limit(1);
    policy = p;
  }

  if (!policy) {
    return { slaPolicyId: null, slaResponseDueAt: null, slaResolutionDueAt: null, slaDueAt: null, policyName: null };
  }

  // 3. Get minutes based on priority
  let responseMinutes: number;
  let resolutionMinutes: number;

  switch (priority) {
    case 'critical':
      responseMinutes = policy.criticalResponseMinutes;
      resolutionMinutes = policy.criticalResolutionMinutes;
      break;
    case 'high':
      responseMinutes = policy.highResponseMinutes;
      resolutionMinutes = policy.highResolutionMinutes;
      break;
    case 'low':
      responseMinutes = policy.lowResponseMinutes;
      resolutionMinutes = policy.lowResolutionMinutes;
      break;
    case 'medium':
    default:
      responseMinutes = policy.mediumResponseMinutes;
      resolutionMinutes = policy.mediumResolutionMinutes;
      break;
  }

  let slaResponseDueAt: Date;
  let slaResolutionDueAt: Date;

  if (policy.businessHoursEnabled) {
    const holidays = Array.isArray(policy.holidays) ? policy.holidays as string[] : [];
    const hoursStart = policy.businessHoursStart ?? '09:00';
    const hoursEnd = policy.businessHoursEnd ?? '17:00';
    const businessDays = policy.businessDays ?? '1,2,3,4,5';
    const timeZone = await getTenantTimezone(db, tenantId);

    slaResponseDueAt = addBusinessMinutes(createdAt, responseMinutes, hoursStart, hoursEnd, businessDays, holidays, timeZone);
    slaResolutionDueAt = addBusinessMinutes(createdAt, resolutionMinutes, hoursStart, hoursEnd, businessDays, holidays, timeZone);
  } else {
    // Simple linear calculation
    slaResponseDueAt = new Date(createdAt.getTime() + responseMinutes * 60000);
    slaResolutionDueAt = new Date(createdAt.getTime() + resolutionMinutes * 60000);
  }

  return {
    slaPolicyId: policy.id,
    slaResponseDueAt,
    slaResolutionDueAt,
    slaDueAt: slaResolutionDueAt,
    policyName: policy.name,
  };
}
