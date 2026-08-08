import { eq, and, lte } from 'drizzle-orm';
import { tickets, tenantSequences, recurringTicketRules } from '@rivertown/db';
import { sql } from 'drizzle-orm';
import { getTenantTimezone } from '../common/timezone.js';
import { calculateNextRecurringRun } from '../common/recurrence.js';

export function startRecurringTicketScheduler(db: any) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();

      // Find all active recurring rules across all tenants where nextRunAt <= now
      const dueRules = await db.select().from(recurringTicketRules)
        .where(and(
          eq(recurringTicketRules.isActive, true),
          lte(recurringTicketRules.nextRunAt, now),
        ));

      for (const rule of dueRules) {
        try {
          // Get next ticket number
          const [seqResult] = await db
            .update(tenantSequences)
            .set({ currentValue: sql`(${tenantSequences.currentValue}::int + 1)::text` })
            .where(and(
              eq(tenantSequences.tenantId, rule.tenantId),
              eq(tenantSequences.sequenceName, 'ticket'),
            ))
            .returning({ value: tenantSequences.currentValue });

          if (!seqResult) {
            console.error(`[recurring-tickets] No ticket sequence found for tenant ${rule.tenantId}`);
            continue;
          }

          const ticketNumber = parseInt(seqResult.value, 10);

          // First: update nextRunAt to prevent duplicate runs
          const timeZone = await getTenantTimezone(db, rule.tenantId);
          const nextRunAt = calculateNextRecurringRun(rule.frequency, rule.dayOfWeek, rule.dayOfMonth, timeZone, now);
          await db.update(recurringTicketRules).set({
            lastRunAt: now,
            nextRunAt,
            updatedAt: now,
          }).where(eq(recurringTicketRules.id, rule.id));

          // Then: create the ticket from the rule template
          const [newTicket] = await db.insert(tickets).values({
            tenantId: rule.tenantId,
            ticketNumber,
            customerId: rule.customerId,
            subject: rule.subject,
            description: rule.description,
            priority: rule.priority ?? 'medium',
            categoryId: rule.categoryId,
            assignedTo: rule.assignedTo,
            queueId: rule.queueId,
            source: 'recurring',
          }).returning();

          const { notifyTenantStaff } = await import('./notifications.js');
          await notifyTenantStaff(db, {
            tenantId: rule.tenantId,
            type: 'ticket_created',
            title: `New ticket #${ticketNumber}`,
            body: newTicket.subject,
            entityType: 'ticket',
            entityId: newTicket.id,
          }).catch(() => {});

          console.log(`[recurring-tickets] Created ticket #${ticketNumber} from rule "${rule.name}" (tenant ${rule.tenantId})`);
        } catch (err) {
          console.error(`[recurring-tickets] Rule ${rule.id} failed:`, err);
        }
      }
    } catch (err) {
      console.error('[recurring-tickets] Scheduler error:', err);
    } finally {
      running = false;
    }
  }, 60_000);
}
