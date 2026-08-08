import { eq, and, lte } from 'drizzle-orm';
import { tenants, tickets, tenantSequences, recurringTicketRules } from '@rivertown/db';
import { sql } from 'drizzle-orm';

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
          const nextRunAt = calculateNextRun(rule.frequency, rule.dayOfWeek, rule.dayOfMonth);
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

function calculateNextRun(frequency: string, dayOfWeek?: number | null, dayOfMonth?: number | null): Date {
  const now = new Date();
  switch (frequency) {
    case 'daily': {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      return next;
    }
    case 'weekly': {
      const next = new Date(now);
      const targetDay = dayOfWeek ?? 1; // Default Monday
      const currentDay = next.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      next.setDate(next.getDate() + daysUntil);
      next.setHours(8, 0, 0, 0);
      return next;
    }
    case 'monthly': {
      const next = new Date(now);
      const targetDay = dayOfMonth ?? 1;
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(targetDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      next.setHours(8, 0, 0, 0);
      return next;
    }
    default: {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      return next;
    }
  }
}
