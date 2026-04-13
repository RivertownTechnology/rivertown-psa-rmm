/**
 * Nightly contract-hours maintenance.
 *
 * Three idempotent, time-aware sub-tasks:
 *   1. resetPeriodBlocks     — bump periodStartDate forward when the current
 *                              period has ended (monthly/quarterly/annual).
 *   2. expireOneTimeBlocks   — for lines where expiresAt has passed and we
 *                              haven't sent an "expired" alert yet, send one.
 *   3. sendWarnThresholdAlerts — for lines where current usage crosses warnAtPct
 *                              and we haven't warned in the current period.
 *
 * Designed to be called hourly from server.ts; each sub-task is a no-op if
 * there's nothing to do.
 */
import { eq, and, isNotNull, lte, sql } from 'drizzle-orm';
import {
  contracts,
  contractLineItems,
  tenants,
  customers,
  users,
} from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { liveBlockBalanceHours } from '../modules/contracts/billing-logic.js';
import { logAudit } from '../common/audit.js';
import { sendEmail } from '../services/email.js';

// How frequently a single line can trigger a fresh warn email.
// Once per 24h dedupes without turning the alert stream into a one-shot.
const WARN_DEDUPE_MS = 24 * 60 * 60 * 1000;

function addCadence(d: Date, cadence: 'monthly' | 'quarterly' | 'annual'): Date {
  const n = new Date(d);
  if (cadence === 'monthly') n.setUTCMonth(n.getUTCMonth() + 1);
  else if (cadence === 'quarterly') n.setUTCMonth(n.getUTCMonth() + 3);
  else if (cadence === 'annual') n.setUTCFullYear(n.getUTCFullYear() + 1);
  return n;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * For every block line with a resetCadence, if the next period has started,
 * bump periodStartDate forward and clear warnedAt. Time entries from prior
 * periods remain attached to the line; the resolver just stops counting them.
 */
export async function resetPeriodBlocks(db: Database): Promise<{ reset: number }> {
  const lines = await db
    .select({
      id: contractLineItems.id,
      tenantId: contractLineItems.tenantId,
      contractId: contractLineItems.contractId,
      resetCadence: contractLineItems.resetCadence,
      periodStartDate: contractLineItems.periodStartDate,
      description: contractLineItems.description,
    })
    .from(contractLineItems)
    .where(
      and(
        eq(contractLineItems.coveragePolicy, 'block'),
        isNotNull(contractLineItems.resetCadence),
      ),
    );

  const now = new Date();
  let resetCount = 0;
  for (const line of lines) {
    if (!line.resetCadence || !line.periodStartDate) continue;
    const cadence = line.resetCadence as 'monthly' | 'quarterly' | 'annual';
    let periodStart = new Date(line.periodStartDate + 'T00:00:00Z');
    let nextStart = addCadence(periodStart, cadence);
    // Roll forward as many periods as needed (e.g. catchup after long downtime).
    while (nextStart <= now) {
      periodStart = nextStart;
      nextStart = addCadence(periodStart, cadence);
    }
    const newStartStr = toDateOnly(periodStart);
    if (newStartStr !== line.periodStartDate) {
      await db
        .update(contractLineItems)
        .set({ periodStartDate: newStartStr, warnedAt: null, updatedAt: new Date() })
        .where(eq(contractLineItems.id, line.id));
      await logAudit(db, {
        tenantId: line.tenantId,
        actorType: 'system',
        actorId: '00000000-0000-0000-0000-000000000000',
        action: 'contract_line.period_reset',
        entityType: 'contract_line_item',
        entityId: line.id,
        changes: { periodStartDate: { old: line.periodStartDate, new: newStartStr } },
      });
      resetCount++;
    }
  }
  return { reset: resetCount };
}

/**
 * For one-time blocks where expiresAt has passed and we haven't alerted yet,
 * send an email to the contract owner (account manager or tenant owner) and
 * stamp expiredNotifiedAt. Block lines remain rejectable by the resolver
 * (which checks expiresAt directly) — this is just the heads-up.
 */
export async function expireOneTimeBlocks(db: Database): Promise<{ notified: number }> {
  const now = new Date();
  const candidates = await db
    .select({
      id: contractLineItems.id,
      tenantId: contractLineItems.tenantId,
      contractId: contractLineItems.contractId,
      description: contractLineItems.description,
      expiresAt: contractLineItems.expiresAt,
      blockHours: contractLineItems.blockHours,
      periodStartDate: contractLineItems.periodStartDate,
    })
    .from(contractLineItems)
    .where(
      and(
        eq(contractLineItems.coveragePolicy, 'block'),
        isNotNull(contractLineItems.expiresAt),
        lte(contractLineItems.expiresAt, now),
        sql`${contractLineItems.expiredNotifiedAt} IS NULL`,
      ),
    );

  let notified = 0;
  for (const line of candidates) {
    // Pull contract + customer for email context
    const [contract] = await db
      .select({
        name: contracts.name,
        customerId: contracts.customerId,
      })
      .from(contracts)
      .where(eq(contracts.id, line.contractId))
      .limit(1);
    if (!contract) continue;

    const [customer] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, contract.customerId))
      .limit(1);

    const remaining = await liveBlockBalanceHours(db, {
      id: line.id,
      blockHours: line.blockHours,
      tenantId: line.tenantId,
      periodStartDate: line.periodStartDate ?? null,
    });

    const to = await findTenantOwnerEmail(db, line.tenantId);
    if (!to) continue;

    const subject = `[ForgePSA] Block expired — ${customer?.name ?? 'customer'} / ${contract.name}`;
    const html = `
      <p>The following block of hours has expired:</p>
      <ul>
        <li><strong>Customer:</strong> ${escape(customer?.name ?? '')}</li>
        <li><strong>Contract:</strong> ${escape(contract.name)}</li>
        <li><strong>Line:</strong> ${escape(line.description)}</li>
        <li><strong>Expired:</strong> ${line.expiresAt ? new Date(line.expiresAt).toLocaleString() : ''}</li>
        <li><strong>Remaining at expiry:</strong> ${remaining.toFixed(1)}h</li>
      </ul>
      <p>New time entries against this block will be rejected. Extend the expiration on the contract line if the customer has agreed to a renewal.</p>
    `;
    try {
      await sendEmail(db, line.tenantId, { to, subject, html });
    } catch (err) {
      console.error('[CONTRACT-HOURS] expire email failed:', err);
      continue;
    }
    await db
      .update(contractLineItems)
      .set({ expiredNotifiedAt: now, updatedAt: now })
      .where(eq(contractLineItems.id, line.id));
    await logAudit(db, {
      tenantId: line.tenantId,
      actorType: 'system',
      actorId: '00000000-0000-0000-0000-000000000000',
      action: 'contract_line.expired_notified',
      entityType: 'contract_line_item',
      entityId: line.id,
    });
    notified++;
  }
  return { notified };
}

/**
 * For every block line, check current usage vs warnAtPct. If the remaining
 * balance has fallen below the threshold and we haven't warned in the dedupe
 * window, send an email and stamp warnedAt.
 */
export async function sendWarnThresholdAlerts(db: Database): Promise<{ warned: number }> {
  const lines = await db
    .select({
      id: contractLineItems.id,
      tenantId: contractLineItems.tenantId,
      contractId: contractLineItems.contractId,
      description: contractLineItems.description,
      blockHours: contractLineItems.blockHours,
      warnAtPct: contractLineItems.warnAtPct,
      warnedAt: contractLineItems.warnedAt,
      periodStartDate: contractLineItems.periodStartDate,
    })
    .from(contractLineItems)
    .where(eq(contractLineItems.coveragePolicy, 'block'));

  const now = new Date();
  let warned = 0;
  for (const line of lines) {
    const total = parseFloat(line.blockHours ?? '0');
    if (total <= 0) continue;
    const remaining = await liveBlockBalanceHours(db, {
      id: line.id,
      blockHours: line.blockHours,
      tenantId: line.tenantId,
      periodStartDate: line.periodStartDate ?? null,
    });
    const warnPct = line.warnAtPct ?? 80;
    const threshold = total * (1 - warnPct / 100);
    if (remaining > threshold) continue;

    if (line.warnedAt && now.getTime() - new Date(line.warnedAt).getTime() < WARN_DEDUPE_MS) {
      continue;
    }

    const [contract] = await db
      .select({ name: contracts.name, customerId: contracts.customerId })
      .from(contracts)
      .where(eq(contracts.id, line.contractId))
      .limit(1);
    if (!contract) continue;

    const [customer] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, contract.customerId))
      .limit(1);

    const to = await findTenantOwnerEmail(db, line.tenantId);
    if (!to) continue;

    const pctUsed = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;
    const subject = `[ForgePSA] Block at ${pctUsed}% — ${customer?.name ?? 'customer'} / ${contract.name}`;
    const html = `
      <p>A block of hours is nearing its threshold:</p>
      <ul>
        <li><strong>Customer:</strong> ${escape(customer?.name ?? '')}</li>
        <li><strong>Contract:</strong> ${escape(contract.name)}</li>
        <li><strong>Line:</strong> ${escape(line.description)}</li>
        <li><strong>Used:</strong> ${(total - remaining).toFixed(1)}h of ${total.toFixed(1)}h (${pctUsed}%)</li>
        <li><strong>Remaining:</strong> ${remaining.toFixed(1)}h</li>
      </ul>
      <p>Consider reaching out to the customer about extending or adding hours.</p>
    `;
    try {
      await sendEmail(db, line.tenantId, { to, subject, html });
    } catch (err) {
      console.error('[CONTRACT-HOURS] warn email failed:', err);
      continue;
    }
    await db
      .update(contractLineItems)
      .set({ warnedAt: now, updatedAt: now })
      .where(eq(contractLineItems.id, line.id));
    await logAudit(db, {
      tenantId: line.tenantId,
      actorType: 'system',
      actorId: '00000000-0000-0000-0000-000000000000',
      action: 'contract_line.warn_sent',
      entityType: 'contract_line_item',
      entityId: line.id,
      changes: { remainingHours: { old: null, new: remaining }, pctUsed: { old: null, new: pctUsed } },
    });
    warned++;
  }
  return { warned };
}

async function findTenantOwnerEmail(db: Database, tenantId: string): Promise<string | null> {
  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const settings = (tenant?.settings ?? {}) as Record<string, string>;
  if (settings.alertEmail) return settings.alertEmail;
  if (settings.businessEmail) return settings.businessEmail;
  // Fall back to the first owner user
  const [owner] = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'owner'), eq(users.isActive, true)))
    .limit(1);
  return owner?.email ?? null;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Runs all three sub-tasks. Safe to call frequently — each task is idempotent
 * and no-ops when nothing is due.
 */
export async function runContractHoursNightly(db: Database): Promise<void> {
  const start = Date.now();
  try {
    const reset = await resetPeriodBlocks(db);
    const expired = await expireOneTimeBlocks(db);
    const warned = await sendWarnThresholdAlerts(db);
    const totalChanges = reset.reset + expired.notified + warned.warned;
    if (totalChanges > 0) {
      console.log(
        `[CONTRACT-HOURS] ${reset.reset} period reset · ${expired.notified} expired · ${warned.warned} warned · ${Date.now() - start}ms`,
      );
    }
  } catch (err) {
    console.error('[CONTRACT-HOURS] nightly run failed:', err);
  }
}
