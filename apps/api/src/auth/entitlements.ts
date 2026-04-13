import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { tenants } from '@rivertown/db';
import {
  computeEntitlements, hasFeature, type Entitlements, type FeatureKey,
} from '@rivertown/shared';

/**
 * Load a tenant's entitlements from the DB. Small cache to avoid hammering on
 * hot paths; invalidated when admin changes plan/flags via the admin route.
 */
const cache = new Map<string, { ent: Entitlements; expires: number }>();
const CACHE_TTL_MS = 60 * 1000;

export async function getEntitlements(
  fastify: FastifyInstance,
  tenantId: string,
): Promise<Entitlements | null> {
  const cached = cache.get(tenantId);
  if (cached && cached.expires > Date.now()) return cached.ent;

  const [row] = await fastify.db
    .select({
      planTier: tenants.planTier,
      featureFlags: tenants.featureFlags,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) return null;
  const ent = computeEntitlements(row.planTier, row.featureFlags as Record<string, boolean>);
  cache.set(tenantId, { ent, expires: Date.now() + CACHE_TTL_MS });
  return ent;
}

export function invalidateEntitlementsCache(tenantId: string) {
  cache.delete(tenantId);
}

/**
 * preHandler factory that 402s a request if the tenant's plan doesn't include
 * the required feature. Use on any route that backs a plan-gated capability.
 *
 *   fastify.post('/api/v1/ai/summarize', {
 *     preHandler: [fastify.authenticate, requireFeature(fastify, 'ai_assistant')],
 *   }, handler);
 */
export function requireFeature(fastify: FastifyInstance, feature: FeatureKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { tid?: string } | undefined;
    if (!user?.tid) {
      reply.code(401).send({ error: 'UNAUTHORIZED' });
      return;
    }
    const ent = await getEntitlements(fastify, user.tid);
    if (!ent || !hasFeature(ent, feature)) {
      reply.code(402).send({
        error: 'PLAN_UPGRADE_REQUIRED',
        message: `This feature requires a higher plan. Contact support to upgrade.`,
        feature,
        currentPlan: ent?.plan ?? 'starter',
      });
    }
  };
}
