import type { Database } from '@rivertown/db';
import { tenants } from '@rivertown/db';
import { eq } from 'drizzle-orm';
import { getRedis } from './token-blacklist.js';

export interface TenantSubscriptionState {
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  trialEndsAt: Date | null;
  pastDueAt: Date | null;
}

const TTL_SECONDS = 60; // 1 minute — short enough that state changes propagate quickly

/**
 * Fetch a tenant's subscription state, using Redis as a write-through cache.
 * Used by the trial-enforcement preHandler on every write request, so avoiding
 * the DB round-trip here is a meaningful perf win.
 */
export async function getTenantSubscriptionState(
  db: Database,
  tenantId: string,
): Promise<TenantSubscriptionState | null> {
  const redis = getRedis();
  const cacheKey = `tsub:${tenantId}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          status: TenantSubscriptionState['status'];
          trialEndsAt: string | null;
          pastDueAt: string | null;
        };
        return {
          status: parsed.status,
          trialEndsAt: parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : null,
          pastDueAt: parsed.pastDueAt ? new Date(parsed.pastDueAt) : null,
        };
      }
    } catch {
      // Redis hiccup — fall through to DB
    }
  }

  const [row] = await db
    .select({
      status: tenants.subscriptionStatus,
      trialEndsAt: tenants.trialEndsAt,
      pastDueAt: tenants.pastDueAt,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) return null;

  const state: TenantSubscriptionState = {
    status: row.status as TenantSubscriptionState['status'],
    trialEndsAt: row.trialEndsAt,
    pastDueAt: row.pastDueAt,
  };

  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(state), 'EX', TTL_SECONDS);
    } catch {
      // Non-fatal
    }
  }

  return state;
}

/**
 * Invalidate the cache for a tenant — call from webhook handlers and admin
 * endpoints that change subscription state so updates take effect immediately.
 */
export async function invalidateTenantSubscriptionCache(tenantId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`tsub:${tenantId}`);
  } catch {
    // Non-fatal
  }
}
