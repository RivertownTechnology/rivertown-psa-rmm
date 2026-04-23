import { eq, and } from 'drizzle-orm';
import { slaPolicies, customers } from '@rivertown/db';
import type { Database } from '@rivertown/db';

interface SlaResult {
  slaPolicyId: string | null;
  slaResponseDueAt: Date | null;
  slaResolutionDueAt: Date | null;
  slaDueAt: Date | null;
  policyName: string | null;
}

function isHoliday(date: Date, holidays: string[]): boolean {
  return holidays.includes(date.toISOString().split('T')[0]);
}

function advanceToNextBusinessStart(date: Date, days: number[], holidays: string[], startH: number, startM: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  next.setHours(startH, startM, 0, 0);
  while (!days.includes(next.getDay()) || isHoliday(next, holidays)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function addBusinessMinutes(
  start: Date,
  minutes: number,
  hoursStart: string, // "09:00"
  hoursEnd: string,   // "17:00"
  daysStr: string,    // "1,2,3,4,5"
  holidays: string[], // ["2026-12-25"]
): Date {
  const days = daysStr.split(',').map(Number);
  const [startH, startM] = hoursStart.split(':').map(Number);
  const [endH, endM] = hoursEnd.split(':').map(Number);
  const businessEndMinute = endH * 60 + endM;
  const businessStartMinute = startH * 60 + startM;

  let remaining = minutes;
  let current = new Date(start);

  // If starting outside business hours, advance to next business hour start
  const currentDayOfWeek = current.getDay();
  const currentMinuteOfDay = current.getHours() * 60 + current.getMinutes();

  // Advance to start of next business period if outside hours
  if (!days.includes(currentDayOfWeek) ||
      isHoliday(current, holidays) ||
      currentMinuteOfDay >= businessEndMinute) {
    current = advanceToNextBusinessStart(current, days, holidays, startH, startM);
  } else if (currentMinuteOfDay < businessStartMinute) {
    current.setHours(startH, startM, 0, 0);
  }

  while (remaining > 0) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split('T')[0];

    if (!days.includes(dayOfWeek) || holidays.includes(dateStr)) {
      // Skip non-business day
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }

    const currentMinute = current.getHours() * 60 + current.getMinutes();
    const minutesLeftToday = businessEndMinute - currentMinute;

    if (remaining <= minutesLeftToday) {
      current = new Date(current.getTime() + remaining * 60000);
      remaining = 0;
    } else {
      remaining -= minutesLeftToday;
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
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

    slaResponseDueAt = addBusinessMinutes(createdAt, responseMinutes, hoursStart, hoursEnd, businessDays, holidays);
    slaResolutionDueAt = addBusinessMinutes(createdAt, resolutionMinutes, hoursStart, hoursEnd, businessDays, holidays);
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
