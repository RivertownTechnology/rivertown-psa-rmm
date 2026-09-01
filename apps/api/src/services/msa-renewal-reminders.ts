import { eq, and, lte, isNull, isNotNull } from 'drizzle-orm';
import { agreements, customers } from '@rivertown/db';
import { notifyTenantStaff } from './notifications.js';

const REMINDER_LEAD_DAYS = 30;

/**
 * Notifies staff once per agreement when a customer's current signed MSA is
 * within 30 days of its yearly re-sign date (renewal_notice_at stamps the
 * agreement so the sweep never repeats itself). Sending the renewal itself
 * stays a staff action — POST /api/v1/agreements/send.
 */
export function startMsaRenewalReminderScheduler(db: any) {
  let running = false;

  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const cutoff = new Date(Date.now() + REMINDER_LEAD_DAYS * 86_400_000).toISOString().split('T')[0];
      const due = await db.select({
        id: agreements.id,
        tenantId: agreements.tenantId,
        customerId: agreements.customerId,
        customerName: customers.name,
        expiresAt: agreements.expiresAt,
      }).from(agreements)
        .innerJoin(customers, eq(customers.id, agreements.customerId))
        .where(and(
          eq(agreements.agreementType, 'msa'),
          eq(agreements.status, 'signed'),
          isNotNull(agreements.expiresAt),
          lte(agreements.expiresAt, cutoff),
          isNull(agreements.renewalNoticeAt),
        )).limit(100);

      for (const row of due) {
        try {
          const expired = row.expiresAt <= new Date().toISOString().split('T')[0];
          await notifyTenantStaff(db, {
            tenantId: row.tenantId,
            type: 'msa_renewal_due',
            title: expired
              ? `MSA renewal overdue: ${row.customerName}`
              : `MSA renewal due ${row.expiresAt}: ${row.customerName}`,
            body: 'Send this year\'s agreement from the customer page when the updated MSA template is ready.',
            entityType: 'agreement',
            entityId: row.id,
          });
          await db.update(agreements).set({ renewalNoticeAt: new Date(), updatedAt: new Date() })
            .where(eq(agreements.id, row.id));
          console.log(`[msa-renewal] Notified staff: ${row.customerName} MSA expires ${row.expiresAt}`);
        } catch (err) {
          console.error(`[msa-renewal] Reminder for agreement ${row.id} failed:`, err);
        }
      }
    } catch (err) {
      console.error('[msa-renewal] Sweep error:', err);
    } finally {
      running = false;
    }
  };

  setTimeout(sweep, 60_000); // first pass shortly after boot
  setInterval(sweep, 6 * 60 * 60_000);
}
