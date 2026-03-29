import { eq, and, sql } from 'drizzle-orm';
import { tickets, contracts, contractLineItems, ticketTimeEntries } from '@rivertown/db';
import type { Database } from '@rivertown/db';

interface BillabilityResult {
  isBillable: boolean;
  rateCents: number | null;
  reason: 'no_contract' | 'covered_by_contract' | 'block_time_exceeded' | 'block_time_covered' | 'ad_hoc_contract';
}

export async function determineTimeBillability(
  db: Database,
  tenantId: string,
  ticketId: string,
  durationMinutes: number,
  defaultRateCents: number = 15000, // $150/hr default
): Promise<BillabilityResult> {
  // 1. Get ticket's contractId
  const [ticket] = await db.select({ contractId: tickets.contractId })
    .from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId))).limit(1);

  if (!ticket?.contractId) {
    return { isBillable: true, rateCents: defaultRateCents, reason: 'no_contract' };
  }

  // 2. Get the contract
  const [contract] = await db.select({ contractType: contracts.contractType })
    .from(contracts).where(eq(contracts.id, ticket.contractId)).limit(1);

  if (!contract) {
    return { isBillable: true, rateCents: defaultRateCents, reason: 'no_contract' };
  }

  // 3. Determine by contract type
  switch (contract.contractType) {
    case 'managed_services':
    case 'recurring_flat':
    case 'per_device':
    case 'per_user':
      return { isBillable: false, rateCents: null, reason: 'covered_by_contract' };

    case 'break_fix':
      return { isBillable: true, rateCents: defaultRateCents, reason: 'ad_hoc_contract' };

    case 'block_time': {
      // Sum block hours from line items
      const lineItems = await db.select({
        blockHours: contractLineItems.blockHours,
        blockHoursUsed: contractLineItems.blockHoursUsed,
        unitPriceCents: contractLineItems.unitPriceCents,
      }).from(contractLineItems)
        .where(and(
          eq(contractLineItems.contractId, ticket.contractId),
          eq(contractLineItems.itemType, 'block_time'),
        ));

      let totalBlockHours = 0;
      let totalUsed = 0;
      let overageRate = defaultRateCents;

      for (const item of lineItems) {
        totalBlockHours += parseFloat(item.blockHours ?? '0');
        totalUsed += parseFloat(item.blockHoursUsed ?? '0');
        if (item.unitPriceCents) overageRate = item.unitPriceCents;
      }

      const hoursToAdd = durationMinutes / 60;
      if (totalUsed + hoursToAdd <= totalBlockHours) {
        return { isBillable: false, rateCents: null, reason: 'block_time_covered' };
      } else {
        return { isBillable: true, rateCents: overageRate, reason: 'block_time_exceeded' };
      }
    }

    case 'ad_hoc':
      return { isBillable: true, rateCents: defaultRateCents, reason: 'ad_hoc_contract' };

    default:
      return { isBillable: true, rateCents: defaultRateCents, reason: 'no_contract' };
  }
}
