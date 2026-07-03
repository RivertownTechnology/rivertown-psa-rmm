import { eq, and, lt } from 'drizzle-orm';
import { tenants, tickets } from '@rivertown/db';

export function startTicketAutoCloseScheduler(db: any) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const allTenants = await db.select({ id: tenants.id, settings: tenants.settings }).from(tenants);

      for (const tenant of allTenants) {
        const settings = (tenant.settings ?? {}) as Record<string, unknown>;

        try {
          // Auto-close resolved tickets
          if (settings.ticketAutoCloseResolvedEnabled) {
            const days = (settings.ticketAutoCloseResolvedDays as number) ?? 3;
            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            await db.update(tickets)
              .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
              .where(and(
                eq(tickets.tenantId, tenant.id),
                eq(tickets.status, 'resolved'),
                lt(tickets.resolvedAt, cutoff),
              ));
          }

          // Auto-close waiting_on_customer tickets
          if (settings.ticketAutoCloseWaitingEnabled) {
            const days = (settings.ticketAutoCloseWaitingDays as number) ?? 7;
            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            await db.update(tickets)
              .set({ status: 'closed', closedAt: new Date(), slaPausedAt: null, updatedAt: new Date() })
              .where(and(
                eq(tickets.tenantId, tenant.id),
                eq(tickets.status, 'waiting_on_customer'),
                lt(tickets.updatedAt, cutoff),
              ));
          }
        } catch (err) {
          console.error(`[ticket-autoclose] Tenant ${tenant.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[ticket-autoclose] Scheduler error:', err);
    } finally {
      running = false;
    }
    // Day-granularity cutoff — hourly is plenty (was 60s)
  }, 3_600_000);
}
