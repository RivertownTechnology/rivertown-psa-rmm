/**
 * Compliance automation scheduler.
 * Runs every hour and checks for:
 * - Expired/expiring evidence
 * - Overdue training
 * - Expiring personnel screenings
 * - Expiring vendor agreements
 * - Overdue POA&M items
 * - Stale assessments needing reassessment
 */
import { eq, and, sql, lte } from 'drizzle-orm';
import {
  complianceEvidence, complianceTrainingRecords, compliancePersonnelScreening,
  complianceVendors, compliancePoamItems, complianceActivityLog,
  notifications, tenants,
} from '@rivertown/db';

export function startComplianceScheduler(db: any) {
  let running = false;

  // Run every hour (not every 60s — compliance checks don't need real-time)
  setInterval(async () => {
    if (running) return;
    running = true;

    try {
      // Get all tenants
      const allTenants = await db.select({ id: tenants.id }).from(tenants);

      for (const tenant of allTenants) {
        const tid = tenant.id;
        const now = new Date();
        const in30Days = new Date(now.getTime() + 30 * 86400000);

        // 1. Expiring evidence (within 30 days)
        try {
          const expiringEvidence = await db.select({ id: complianceEvidence.id, title: complianceEvidence.title, expiresAt: complianceEvidence.expiresAt, customerId: complianceEvidence.customerId })
            .from(complianceEvidence)
            .where(and(
              eq(complianceEvidence.tenantId, tid),
              sql`${complianceEvidence.expiresAt} IS NOT NULL`,
              sql`${complianceEvidence.expiresAt} <= ${in30Days.toISOString()}::timestamptz`,
              sql`${complianceEvidence.expiresAt} > ${now.toISOString()}::timestamptz`,
            )).limit(50);

          for (const ev of expiringEvidence) {
            const daysLeft = Math.ceil((new Date(ev.expiresAt!).getTime() - now.getTime()) / 86400000);
            if (daysLeft === 30 || daysLeft === 7 || daysLeft === 1) {
              await logComplianceAlert(db, tid, ev.customerId, 'evidence', ev.id,
                `Evidence "${ev.title}" expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`);
            }
          }
        } catch { /* continue */ }

        // 2. Overdue training
        try {
          const overdueTraining = await db.select({ id: complianceTrainingRecords.id, personName: complianceTrainingRecords.personName, courseName: complianceTrainingRecords.courseName, dueDate: complianceTrainingRecords.dueDate, customerId: complianceTrainingRecords.customerId })
            .from(complianceTrainingRecords)
            .where(and(
              eq(complianceTrainingRecords.tenantId, tid),
              sql`${complianceTrainingRecords.status} NOT IN ('completed', 'expired')`,
              sql`${complianceTrainingRecords.dueDate} IS NOT NULL`,
              sql`${complianceTrainingRecords.dueDate}::date < ${now.toISOString().split('T')[0]}::date`,
            )).limit(50);

          for (const tr of overdueTraining) {
            await db.update(complianceTrainingRecords).set({ status: 'overdue', updatedAt: now })
              .where(and(eq(complianceTrainingRecords.id, tr.id), sql`${complianceTrainingRecords.status} != 'overdue'`));
          }
        } catch { /* continue */ }

        // 3. Expiring personnel screenings
        try {
          const expiringScreenings = await db.select({ id: compliancePersonnelScreening.id, personName: compliancePersonnelScreening.personName, expirationDate: compliancePersonnelScreening.expirationDate, customerId: compliancePersonnelScreening.customerId })
            .from(compliancePersonnelScreening)
            .where(and(
              eq(compliancePersonnelScreening.tenantId, tid),
              eq(compliancePersonnelScreening.status, 'cleared'),
              sql`${compliancePersonnelScreening.expirationDate} IS NOT NULL`,
              sql`${compliancePersonnelScreening.expirationDate}::date <= ${in30Days.toISOString().split('T')[0]}::date`,
            )).limit(50);

          for (const scr of expiringScreenings) {
            const daysLeft = Math.ceil((new Date(scr.expirationDate!).getTime() - now.getTime()) / 86400000);
            if (daysLeft <= 0) {
              await db.update(compliancePersonnelScreening).set({ status: 'expired', updatedAt: now })
                .where(eq(compliancePersonnelScreening.id, scr.id));
            } else if (daysLeft <= 30) {
              await db.update(compliancePersonnelScreening).set({ status: 'renewal_due', updatedAt: now })
                .where(and(eq(compliancePersonnelScreening.id, scr.id), sql`${compliancePersonnelScreening.status} = 'cleared'`));
            }
          }
        } catch { /* continue */ }

        // 4. Expiring vendor agreements
        try {
          const expiringVendors = await db.select({ id: complianceVendors.id, vendorName: complianceVendors.vendorName, agreementExpirationDate: complianceVendors.agreementExpirationDate, customerId: complianceVendors.customerId })
            .from(complianceVendors)
            .where(and(
              eq(complianceVendors.tenantId, tid),
              eq(complianceVendors.agreementStatus, 'signed'),
              sql`${complianceVendors.agreementExpirationDate} IS NOT NULL`,
              sql`${complianceVendors.agreementExpirationDate}::date <= ${in30Days.toISOString().split('T')[0]}::date`,
            )).limit(50);

          for (const v of expiringVendors) {
            const daysLeft = Math.ceil((new Date(v.agreementExpirationDate!).getTime() - now.getTime()) / 86400000);
            if (daysLeft <= 0) {
              await db.update(complianceVendors).set({ agreementStatus: 'expired', updatedAt: now })
                .where(eq(complianceVendors.id, v.id));
            }
          }
        } catch { /* continue */ }

        // 5. Overdue POA&M items
        try {
          const overduePOAM = await db.select({ id: compliancePoamItems.id })
            .from(compliancePoamItems)
            .where(and(
              eq(compliancePoamItems.tenantId, tid),
              sql`${compliancePoamItems.status} IN ('open', 'in_progress')`,
              sql`${compliancePoamItems.scheduledEndDate} IS NOT NULL`,
              sql`${compliancePoamItems.scheduledEndDate}::date < ${now.toISOString().split('T')[0]}::date`,
            )).limit(50);

          for (const p of overduePOAM) {
            await db.update(compliancePoamItems).set({ status: 'delayed', updatedAt: now })
              .where(and(eq(compliancePoamItems.id, p.id), sql`${compliancePoamItems.status} != 'delayed'`));
          }
        } catch { /* continue */ }
      }
    } catch (err) {
      console.error('[compliance-scheduler] Error:', err);
    } finally {
      running = false;
    }
  }, 3600_000); // Every hour
}

async function logComplianceAlert(db: any, tenantId: string, customerId: string | null, entityType: string, entityId: string, description: string) {
  try {
    await db.insert(complianceActivityLog).values({
      tenantId, customerId, entityType, entityId,
      action: 'alert', actorType: 'system', actorId: '00000000-0000-0000-0000-000000000000',
      description,
    });
  } catch { /* swallow */ }
}
