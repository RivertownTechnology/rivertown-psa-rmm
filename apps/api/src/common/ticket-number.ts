import { eq, and, sql } from 'drizzle-orm';
import { tenantSequences } from '@rivertown/db';
import type { Database } from '@rivertown/db';

// Atomic increment-and-return so concurrent callers (manual create, inbound
// email, recurring tickets) can never be handed the same ticket number.
export async function getNextTicketNumber(db: Database, tenantId: string): Promise<number> {
  const [result] = await db
    .update(tenantSequences)
    .set({ currentValue: sql`(${tenantSequences.currentValue}::int + 1)::text` })
    .where(
      and(
        eq(tenantSequences.tenantId, tenantId),
        eq(tenantSequences.sequenceName, 'ticket'),
      ),
    )
    .returning({ value: tenantSequences.currentValue });

  return parseInt(result.value, 10);
}
