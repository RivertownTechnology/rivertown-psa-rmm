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

  const slaResponseDueAt = new Date(createdAt.getTime() + responseMinutes * 60000);
  const slaResolutionDueAt = new Date(createdAt.getTime() + resolutionMinutes * 60000);

  return {
    slaPolicyId: policy.id,
    slaResponseDueAt,
    slaResolutionDueAt,
    slaDueAt: slaResolutionDueAt,
    policyName: policy.name,
  };
}
