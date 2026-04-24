import { eq, and, isNotNull } from 'drizzle-orm';
import {
  integrationConfigs,
  pax8Subscriptions,
  customers,
  contractLineItems,
  serviceCatalogItems,
} from '@rivertown/db';
import { readCredentials } from '../common/credentials.js';

// ── Pax8 API helpers (shared with routes) ─────────────────────────────

interface Pax8TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface Pax8Product {
  id: string;
  name: string;
  vendorName?: string;
  sku?: string;
}

interface Pax8Subscription {
  id: string;
  companyId: string;
  productId: string;
  productName?: string;
  quantity: number;
  price?: number;
  billingTerm?: string;
  startDate?: string;
  status?: string;
}

interface Pax8PagedResponse<T> {
  page: { size: number; totalElements: number; totalPages: number; number: number };
  content: T[];
}

async function getPax8Token(creds: { clientId: string; clientSecret: string }): Promise<string> {
  const res = await fetch('https://login.pax8.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'client_credentials',
      audience: 'api://p8p.client',
    }),
  });
  if (!res.ok) throw new Error(`Pax8 auth failed (${res.status})`);
  const data = (await res.json()) as Pax8TokenResponse;
  return data.access_token;
}

async function pax8Fetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.pax8.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Pax8 API error (${res.status})`);
  return res.json() as Promise<T>;
}

// ── Proration ─────────────────────────────────────────────────────────

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getDaysRemaining(fromDate: Date): number {
  return getDaysInMonth(fromDate) - fromDate.getDate();
}

async function createProrationLineItem(
  db: any,
  opts: {
    tenantId: string;
    contractId: string;
    productName: string;
    quantityDelta: number;
    unitPriceCents: number;
    unitCostCents: number;
    category: string;
    changeDate: Date;
  },
) {
  const { tenantId, contractId, productName, quantityDelta, unitPriceCents, unitCostCents, category, changeDate } = opts;
  const daysRemaining = getDaysRemaining(changeDate);
  const totalDays = getDaysInMonth(changeDate);
  const factor = daysRemaining / totalDays;

  const monthName = changeDate.toLocaleString('en-US', { month: 'short' });
  const description = `${productName} — Partial Month (${quantityDelta} added, ${monthName} ${changeDate.getDate()}–${totalDays})`;

  await db.insert(contractLineItems).values({
    tenantId,
    contractId,
    description,
    itemType: 'one_time',
    category,
    unitPriceCents: Math.round(unitPriceCents * quantityDelta * factor),
    unitCostCents: Math.round(unitCostCents * quantityDelta * factor),
    quantity: '1',
    taxable: true,
  });
}

// ── Sync frequencies ──────────────────────────────────────────────────

const SYNC_INTERVALS_MS: Record<string, number> = {
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  '4hours': 4 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

export const SYNC_FREQUENCIES = Object.keys(SYNC_INTERVALS_MS);

// ── Scheduled sync runner ─────────────────────────────────────────────

export async function runPax8SyncForTenant(db: any, tenantId: string): Promise<{ synced: number; prorations: number }> {
  const [config] = await db
    .select()
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'pax8')))
    .limit(1);

  if (!config?.isEnabled) return { synced: 0, prorations: 0 };

  const creds = readCredentials(config.credentials) as Record<string, string>;
  if (!creds.clientId || !creds.clientSecret) return { synced: 0, prorations: 0 };

  // Mark syncing
  await db.update(integrationConfigs).set({
    syncStatus: 'syncing', syncError: null, updatedAt: new Date(),
  }).where(eq(integrationConfigs.id, config.id));

  try {
    const token = await getPax8Token({ clientId: creds.clientId, clientSecret: creds.clientSecret });

    const mappedCustomers = await db
      .select({ id: customers.id, pax8CompanyId: customers.pax8CompanyId })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), isNotNull(customers.pax8CompanyId)));

    let totalSynced = 0;
    let totalProrations = 0;

    for (const cust of mappedCustomers) {
      if (!cust.pax8CompanyId) continue;

      const pax8Data = await pax8Fetch<Pax8PagedResponse<Pax8Subscription>>(
        token,
        `/subscriptions?companyId=${cust.pax8CompanyId}&size=200`,
      );

      // Resolve product names
      const pids = [...new Set(pax8Data.content.map((s) => s.productId).filter(Boolean))];
      const nameMap = new Map<string, string>();
      for (const pid of pids) {
        try {
          const prod = await pax8Fetch<Pax8Product>(token, `/products/${pid}`);
          nameMap.set(pid, prod.name);
        } catch { /* delisted */ }
      }

      for (const sub of pax8Data.content) {
        const resolvedName = nameMap.get(sub.productId) || sub.productName || 'Unknown Product';

        const [existing] = await db
          .select()
          .from(pax8Subscriptions)
          .where(and(
            eq(pax8Subscriptions.tenantId, tenantId),
            eq(pax8Subscriptions.pax8SubscriptionId, sub.id),
          ))
          .limit(1);

        const values = {
          pax8CompanyId: sub.companyId,
          customerId: cust.id,
          productName: resolvedName,
          quantity: String(sub.quantity ?? 0),
          unitPriceCents: sub.price != null ? String(Math.round(sub.price * 100)) : null,
          billingTerm: sub.billingTerm ?? null,
          startDate: sub.startDate ?? null,
          status: sub.status ?? null,
          rawData: sub,
          syncedAt: new Date(),
          updatedAt: new Date(),
        };

        if (existing) {
          // Proration check on linked line items
          if (existing.contractLineItemId) {
            const oldQty = parseFloat(existing.quantity ?? '0');
            const newQty = sub.quantity ?? 0;
            const qtyDelta = newQty - oldQty;

            if (qtyDelta > 0) {
              const [linkedLi] = await db
                .select({ contractId: contractLineItems.contractId, unitPriceCents: contractLineItems.unitPriceCents, category: contractLineItems.category })
                .from(contractLineItems)
                .where(eq(contractLineItems.id, existing.contractLineItemId))
                .limit(1);

              if (linkedLi) {
                await createProrationLineItem(db, {
                  tenantId,
                  contractId: linkedLi.contractId,
                  productName: resolvedName,
                  quantityDelta: qtyDelta,
                  unitPriceCents: linkedLi.unitPriceCents,
                  unitCostCents: sub.price != null ? Math.round(sub.price * 100) : 0,
                  category: linkedLi.category || 'license',
                  changeDate: new Date(),
                });
                totalProrations++;
              }
            }

            await db.update(contractLineItems).set({
              unitCostCents: sub.price != null ? Math.round(sub.price * 100) : undefined,
              quantity: String(sub.quantity ?? 1),
              updatedAt: new Date(),
            }).where(eq(contractLineItems.id, existing.contractLineItemId));
          }

          await db.update(pax8Subscriptions).set(values).where(eq(pax8Subscriptions.id, existing.id));
        } else {
          await db.insert(pax8Subscriptions).values({
            tenantId,
            pax8SubscriptionId: sub.id,
            ...values,
          });
        }
        totalSynced++;
      }
    }

    await db.update(integrationConfigs).set({
      syncStatus: 'idle', lastSyncAt: new Date(), syncError: null, updatedAt: new Date(),
    }).where(eq(integrationConfigs.id, config.id));

    return { synced: totalSynced, prorations: totalProrations };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    await db.update(integrationConfigs).set({
      syncStatus: 'error', syncError: message, updatedAt: new Date(),
    }).where(eq(integrationConfigs.id, config.id));
    return { synced: 0, prorations: 0 };
  }
}

/**
 * Start the Pax8 auto-sync polling loop.
 * Checks every 60s which tenants are due for a sync based on their configured frequency.
 */
export function startPax8SyncScheduler(db: any) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      // Find all enabled Pax8 configs
      const configs = await db
        .select()
        .from(integrationConfigs)
        .where(and(eq(integrationConfigs.provider, 'pax8'), eq(integrationConfigs.isEnabled, true)));

      for (const config of configs) {
        const settings = (config.settings ?? {}) as Record<string, string>;
        const frequency = settings.syncFrequency || 'daily';
        const intervalMs = SYNC_INTERVALS_MS[frequency] ?? SYNC_INTERVALS_MS.daily;

        // Check if enough time has passed since last sync
        const lastSync = config.lastSyncAt ? new Date(config.lastSyncAt).getTime() : 0;
        const now = Date.now();
        if (now - lastSync < intervalMs) continue;

        // Don't sync if already syncing
        if (config.syncStatus === 'syncing') continue;

        console.log(`[PAX8-SYNC] Auto-syncing tenant ${config.tenantId} (frequency: ${frequency})`);
        try {
          const result = await runPax8SyncForTenant(db, config.tenantId);
          console.log(`[PAX8-SYNC] Tenant ${config.tenantId}: synced ${result.synced} subs, ${result.prorations} prorations`);
        } catch (err) {
          console.error(`[PAX8-SYNC] Tenant ${config.tenantId} failed:`, err);
        }
      }
    } catch (err) {
      console.error('[PAX8-SYNC] Scheduler error:', err);
    } finally {
      running = false;
    }
  }, 60_000); // Check every 60 seconds
}
