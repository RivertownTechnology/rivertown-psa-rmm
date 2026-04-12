import { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import { systemConfigs, tenants, users } from '@rivertown/db';
import { requireSuperAdmin } from '../../auth/rbac.js';
import { readCredentialsText, writeCredentialsText } from '../../common/credentials.js';
import { invalidateTenantSubscriptionCache } from '../../common/tenant-subscription-cache.js';
import { logAudit } from '../../common/audit.js';

// Known system config keys. Values are always encrypted JSON objects.
const KNOWN_KEYS = ['mailjet', 'stripe'] as const;
type KnownKey = typeof KNOWN_KEYS[number];

// Which fields in each config are secrets and must not be returned in full.
const SECRET_FIELDS: Record<KnownKey, string[]> = {
  mailjet: ['apiSecret'],
  stripe: ['secretKey', 'webhookSecret'],
};

function redact(key: string, creds: Record<string, unknown>): Record<string, unknown> {
  const secrets = SECRET_FIELDS[key as KnownKey] ?? [];
  const out: Record<string, unknown> = { ...creds };
  for (const f of secrets) {
    if (typeof out[f] === 'string' && (out[f] as string).length > 0) {
      out[f] = '••••••••'; // masked presence indicator
    }
  }
  return out;
}

/**
 * Read a system config as a plaintext object. Returns {} if not set.
 * Used by other backend services (system mail, billing webhooks, etc).
 */
export async function readSystemConfig(
  db: FastifyInstance['db'],
  key: string,
): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(systemConfigs).where(eq(systemConfigs.key, key)).limit(1);
  if (!row?.value) return {};
  return readCredentialsText(row.value);
}

export async function adminRoutes(fastify: FastifyInstance) {
  const superAdmin = requireSuperAdmin(fastify);

  // ===== System configs =====

  fastify.get(
    '/api/v1/admin/system-configs',
    { preHandler: [fastify.authenticate, superAdmin] },
    async () => {
      const rows = await fastify.db.select().from(systemConfigs);
      // Ensure all known keys are present in response (empty if unset)
      const map: Record<string, Record<string, unknown>> = {};
      for (const k of KNOWN_KEYS) map[k] = {};
      for (const row of rows) {
        if (!row.value) continue;
        const creds = readCredentialsText(row.value);
        map[row.key] = redact(row.key, creds);
      }
      return map;
    },
  );

  fastify.put(
    '/api/v1/admin/system-configs/:key',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { key } = request.params as { key: string };
      if (!KNOWN_KEYS.includes(key as KnownKey)) {
        reply.code(400);
        return { error: 'UNKNOWN_KEY', message: `Unknown system config key: ${key}` };
      }
      const body = request.body as Record<string, unknown>;

      // Merge with existing so clients can PATCH-style update a subset of fields
      // without wiping secrets they didn't resend (e.g. leave apiSecret as-is)
      const [existing] = await fastify.db
        .select()
        .from(systemConfigs)
        .where(eq(systemConfigs.key, key))
        .limit(1);
      const current = readCredentialsText(existing?.value);
      const secrets = SECRET_FIELDS[key as KnownKey] ?? [];

      const merged: Record<string, unknown> = { ...current };
      for (const [k, v] of Object.entries(body)) {
        // Skip masked secret placeholders — caller didn't mean to overwrite
        if (secrets.includes(k) && typeof v === 'string' && v.startsWith('•')) continue;
        merged[k] = v;
      }

      const encrypted = writeCredentialsText(merged);
      const actor = request.user.sub;

      if (existing) {
        await fastify.db
          .update(systemConfigs)
          .set({ value: encrypted, updatedBy: actor, updatedAt: new Date() })
          .where(eq(systemConfigs.key, key));
      } else {
        await fastify.db.insert(systemConfigs).values({
          key,
          value: encrypted,
          updatedBy: actor,
        });
      }

      await logAudit(fastify.db, {
        tenantId: request.user.tid,
        actorType: 'super_admin',
        actorId: actor,
        action: 'system_config.update',
        entityType: 'system_config',
        entityId: key,
        // Don't log actual values — just which keys changed (secrets!)
        changes: { keys: { old: null, new: Object.keys(body) } },
      });

      request.log.info({ key, by: actor }, '[ADMIN] System config updated');
      return { key, value: redact(key, merged) };
    },
  );

  fastify.delete(
    '/api/v1/admin/system-configs/:key',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { key } = request.params as { key: string };
      await fastify.db.delete(systemConfigs).where(eq(systemConfigs.key, key));
      await logAudit(fastify.db, {
        tenantId: request.user.tid,
        actorType: 'super_admin',
        actorId: request.user.sub,
        action: 'system_config.delete',
        entityType: 'system_config',
        entityId: key,
      });
      reply.code(204).send();
    },
  );

  // Test Mailjet credentials by sending a tiny message to a provided address.
  fastify.post(
    '/api/v1/admin/system-configs/mailjet/test',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const body = z.object({ to: z.string().email() }).parse(request.body);
      const { sendSystemEmail } = await import('../../services/system-mail.js');
      try {
        await sendSystemEmail(fastify.db, {
          to: body.to,
          subject: 'ForgePSA: test email',
          html: '<p>This is a test email from your ForgePSA system Mailjet configuration. If you received this, the configuration is working.</p>',
          text: 'This is a test email from your ForgePSA system Mailjet configuration. If you received this, the configuration is working.',
        });
        return { ok: true };
      } catch (err) {
        reply.code(502);
        return {
          error: 'MAILJET_TEST_FAILED',
          message: err instanceof Error ? err.message : 'Failed to send',
        };
      }
    },
  );

  // ===== Tenants =====

  fastify.get(
    '/api/v1/admin/tenants',
    { preHandler: [fastify.authenticate, superAdmin] },
    async () => {
      // Tenants + user count per tenant in a single query
      const rows = await fastify.db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          planTier: tenants.planTier,
          subscriptionStatus: tenants.subscriptionStatus,
          trialEndsAt: tenants.trialEndsAt,
          pastDueAt: tenants.pastDueAt,
          stripeCustomerId: tenants.stripeCustomerId,
          stripeSubscriptionId: tenants.stripeSubscriptionId,
          createdAt: tenants.createdAt,
          userCount: sql<number>`(select count(*)::int from ${users} u where u.tenant_id = ${tenants.id} and u.is_active = true)`,
        })
        .from(tenants)
        .orderBy(desc(tenants.createdAt));
      return rows;
    },
  );

  fastify.get(
    '/api/v1/admin/tenants/:tenantId',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const [tenant] = await fastify.db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        reply.code(404);
        return { error: 'NOT_FOUND' };
      }
      const tenantUsers = await fastify.db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          isActive: users.isActive,
          isSuperAdmin: users.isSuperAdmin,
        })
        .from(users)
        .where(eq(users.tenantId, tenantId));
      return { tenant, users: tenantUsers };
    },
  );

  // Update a tenant's subscription state (manual override from admin UI)
  fastify.patch(
    '/api/v1/admin/tenants/:tenantId',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const body = z.object({
        planTier: z.enum(['starter', 'pro', 'enterprise']).optional(),
        subscriptionStatus: z.enum(['trial', 'active', 'past_due', 'cancelled']).optional(),
        trialEndsAt: z.string().datetime().nullable().optional(),
      }).parse(request.body);

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (body.planTier) patch.planTier = body.planTier;
      if (body.subscriptionStatus) {
        patch.subscriptionStatus = body.subscriptionStatus;
        if (body.subscriptionStatus === 'active') patch.pastDueAt = null;
      }
      if (body.trialEndsAt !== undefined) {
        patch.trialEndsAt = body.trialEndsAt ? new Date(body.trialEndsAt) : null;
      }

      const [updated] = await fastify.db
        .update(tenants)
        .set(patch)
        .where(eq(tenants.id, tenantId))
        .returning();

      if (!updated) {
        reply.code(404);
        return { error: 'NOT_FOUND' };
      }

      // Invalidate cache so trial enforcement picks up the change immediately
      await invalidateTenantSubscriptionCache(tenantId);

      await logAudit(fastify.db, {
        tenantId,
        actorType: 'super_admin',
        actorId: request.user.sub,
        action: 'tenant.update',
        entityType: 'tenant',
        entityId: tenantId,
        changes: Object.fromEntries(
          Object.entries(patch).map(([k, v]) => [k, { old: null, new: v }]),
        ),
      });

      request.log.info({ tenantId, patch, by: request.user.sub }, '[ADMIN] Tenant updated');
      return updated;
    },
  );
}
