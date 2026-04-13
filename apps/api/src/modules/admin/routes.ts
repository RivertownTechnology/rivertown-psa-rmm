import { FastifyInstance } from 'fastify';
import { eq, sql, desc, and, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  systemConfigs, tenants, users, auditLog, supportTickets,
} from '@rivertown/db';
import { requireSuperAdmin } from '../../auth/rbac.js';
import { readCredentialsText, writeCredentialsText } from '../../common/credentials.js';
import { invalidateTenantSubscriptionCache } from '../../common/tenant-subscription-cache.js';
import { invalidateEntitlementsCache } from '../../auth/entitlements.js';
import { logAudit } from '../../common/audit.js';

// Monthly price per seat for MRR calculation. Pricing authoritative in Stripe;
// these are a rough cash-equivalent for the dashboard only.
const PLAN_PRICES_CENTS: Record<string, number> = {
  starter: 4900,
  pro: 7900,
  enterprise: 0, // custom; excluded from MRR math
};

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

      // Invalidate caches so trial + entitlement checks pick up the change immediately
      await invalidateTenantSubscriptionCache(tenantId);
      invalidateEntitlementsCache(tenantId);

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

  // ===== Metrics (#3) =====

  fastify.get(
    '/api/v1/admin/metrics',
    { preHandler: [fastify.authenticate, superAdmin] },
    async () => {
      const now = Date.now();
      const y = new Date().getFullYear();
      const m = new Date().getMonth();
      const startOfMonth = new Date(y, m, 1);
      const startOfLastMonth = new Date(y, m - 1, 1);

      // Pull lightweight tenant rows and aggregate in JS. Avoids Drizzle parameter
      // interpolation quirks with multiple filter-aggregates + sql`` templates.
      const rows = await fastify.db
        .select({
          id: tenants.id,
          status: tenants.subscriptionStatus,
          planTier: tenants.planTier,
          createdAt: tenants.createdAt,
        })
        .from(tenants);

      let trial = 0, active = 0, pastDue = 0, cancelled = 0;
      let signupsThisMonth = 0, signupsLastMonth = 0;
      let mrrCents = 0;

      for (const t of rows) {
        if (t.status === 'trial') trial++;
        else if (t.status === 'active') active++;
        else if (t.status === 'past_due') pastDue++;
        else if (t.status === 'cancelled') cancelled++;

        const created = t.createdAt.getTime();
        if (created >= startOfMonth.getTime()) signupsThisMonth++;
        else if (created >= startOfLastMonth.getTime()) signupsLastMonth++;

        if (t.status === 'active') {
          const price = PLAN_PRICES_CENTS[t.planTier] ?? 0;
          mrrCents += price;
        }
      }

      let openSupportTickets = 0;
      try {
        const [t] = await fastify.db
          .select({ n: sql<number>`count(*)::int` })
          .from(supportTickets)
          .where(eq(supportTickets.status, 'open'));
        openSupportTickets = t?.n ?? 0;
      } catch {
        // Support tickets table may not exist on older DBs — treat as zero
      }

      // Avoid unused import warning since we removed the complex sql aggregates above
      void now;

      return {
        tenants: { total: rows.length, trial, active, pastDue, cancelled },
        mrrCents,
        signups: { thisMonth: signupsThisMonth, lastMonth: signupsLastMonth },
        openSupportTickets,
      };
    },
  );

  // ===== Activity feed (#4) =====

  fastify.get(
    '/api/v1/admin/activity',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request) => {
      const query = z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).parse(request.query);

      // Pull recent significant events: new tenants, subscription state changes (via audit log),
      // support tickets. Unified into a single activity timeline.
      const [newTenants, recentAudits, recentTickets] = await Promise.all([
        fastify.db
          .select({
            id: tenants.id,
            name: tenants.name,
            slug: tenants.slug,
            createdAt: tenants.createdAt,
            planTier: tenants.planTier,
          })
          .from(tenants)
          .orderBy(desc(tenants.createdAt))
          .limit(query.limit),
        fastify.db
          .select()
          .from(auditLog)
          .where(inArray(auditLog.action, ['tenant.update', 'subscription.status_changed', 'subscription.cancelled', 'payment.failed', 'payment.succeeded']))
          .orderBy(desc(auditLog.createdAt))
          .limit(query.limit),
        fastify.db
          .select()
          .from(supportTickets)
          .orderBy(desc(supportTickets.createdAt))
          .limit(query.limit),
      ]);

      type ActivityItem = {
        kind: 'signup' | 'audit' | 'support';
        at: string;
        text: string;
        tenantId?: string;
        ref?: string;
        data?: Record<string, unknown>;
      };

      const items: ActivityItem[] = [];
      for (const t of newTenants) {
        items.push({
          kind: 'signup',
          at: t.createdAt.toISOString(),
          text: `New signup: ${t.name} (${t.planTier})`,
          tenantId: t.id,
        });
      }
      for (const a of recentAudits) {
        items.push({
          kind: 'audit',
          at: a.createdAt.toISOString(),
          text: `${a.action} on ${a.entityType}:${a.entityId}`,
          tenantId: a.tenantId,
          data: (a.changes ?? undefined) as Record<string, unknown> | undefined,
        });
      }
      for (const s of recentTickets) {
        items.push({
          kind: 'support',
          at: s.createdAt.toISOString(),
          text: `Support [${s.category}]: ${s.subject}`,
          tenantId: s.tenantId ?? undefined,
          ref: s.ref,
        });
      }

      items.sort((a, b) => b.at.localeCompare(a.at));
      return items.slice(0, query.limit);
    },
  );

  // ===== Per-tenant drill-down (#1) =====

  fastify.get(
    '/api/v1/admin/tenants/:tenantId/activity',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) { reply.code(404); return { error: 'NOT_FOUND' }; }

      const audits = await fastify.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.tenantId, tenantId), gte(auditLog.createdAt, since)))
        .orderBy(desc(auditLog.createdAt))
        .limit(100);

      const tickets = await fastify.db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.tenantId, tenantId))
        .orderBy(desc(supportTickets.createdAt))
        .limit(50);

      return { audits, tickets };
    },
  );

  // ===== Impersonation (#2) =====

  fastify.post(
    '/api/v1/admin/tenants/:tenantId/impersonate',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };

      // Impersonate the earliest-created owner of the target tenant
      const [target] = await fastify.db
        .select({ id: users.id, tenantId: users.tenantId, role: users.role, email: users.email })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true), inArray(users.role, ['owner', 'admin'])))
        .orderBy(users.createdAt)
        .limit(1);

      if (!target) {
        reply.code(404);
        return { error: 'NO_TARGET_USER', message: 'No active owner/admin on this tenant.' };
      }

      // Short-lived impersonation tokens — 30-minute access, no refresh (forces explicit re-impersonate)
      const realSuperAdminId = request.user.sub;
      const accessToken = fastify.jwt.sign(
        {
          jti: randomUUID(),
          sub: target.id,
          tid: target.tenantId,
          role: target.role,
          type: 'access' as const,
          imp: realSuperAdminId,
        },
        { expiresIn: '30m' },
      );

      await logAudit(fastify.db, {
        tenantId,
        actorType: 'super_admin',
        actorId: realSuperAdminId,
        action: 'tenant.impersonate',
        entityType: 'user',
        entityId: target.id,
        changes: { target: { old: null, new: target.email } },
      });

      request.log.warn({
        tenantId, targetUserId: target.id, by: realSuperAdminId,
      }, '[ADMIN] Impersonation session started');

      return {
        accessToken,
        user: { id: target.id, email: target.email, role: target.role },
      };
    },
  );

  // ===== Feature flags (#7) =====

  fastify.put(
    '/api/v1/admin/tenants/:tenantId/feature-flags',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const body = z.record(z.boolean()).parse(request.body);

      const [t] = await fastify.db
        .select({ current: tenants.featureFlags })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!t) { reply.code(404); return { error: 'NOT_FOUND' }; }

      const merged = { ...(t.current as Record<string, boolean>), ...body };
      await fastify.db
        .update(tenants)
        .set({ featureFlags: merged, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));

      invalidateEntitlementsCache(tenantId);

      await logAudit(fastify.db, {
        tenantId,
        actorType: 'super_admin',
        actorId: request.user.sub,
        action: 'tenant.feature_flags_update',
        entityType: 'tenant',
        entityId: tenantId,
        changes: Object.fromEntries(
          Object.entries(body).map(([k, v]) => [k, { old: (t.current as Record<string, boolean>)[k] ?? false, new: v }]),
        ),
      });

      return { featureFlags: merged };
    },
  );

  // ===== Refund / credit (#5) =====

  fastify.post(
    '/api/v1/admin/tenants/:tenantId/refund',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const body = z.object({
        amountCents: z.number().int().min(1),
        reason: z.string().max(200).optional(),
      }).parse(request.body);

      const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) { reply.code(404); return { error: 'NOT_FOUND' }; }
      if (!tenant.stripeCustomerId) {
        reply.code(400);
        return { error: 'NO_STRIPE_CUSTOMER', message: 'This tenant has no Stripe customer yet.' };
      }

      // Grab the platform Stripe secret key from system_configs
      const stripeCfg = await readSystemConfig(fastify.db, 'stripe');
      const secretKey = (stripeCfg as Record<string, string>).secretKey;
      if (!secretKey) {
        reply.code(503);
        return { error: 'BILLING_NOT_CONFIGURED' };
      }

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(secretKey);

      // Find the most recent paid charge on this customer and refund from it
      const charges = await stripe.charges.list({
        customer: tenant.stripeCustomerId,
        limit: 10,
      });
      const refundable = charges.data.find((c) => c.paid && !c.refunded && c.amount_refunded < c.amount);
      if (!refundable) {
        reply.code(400);
        return { error: 'NO_REFUNDABLE_CHARGE', message: 'No recent paid charge available to refund.' };
      }

      const refund = await stripe.refunds.create({
        charge: refundable.id,
        amount: body.amountCents,
        reason: 'requested_by_customer',
        metadata: {
          tenantId,
          reason: body.reason ?? 'admin-issued',
          issuedBy: request.user.sub,
        },
      });

      await logAudit(fastify.db, {
        tenantId,
        actorType: 'super_admin',
        actorId: request.user.sub,
        action: 'tenant.refund',
        entityType: 'charge',
        entityId: refundable.id,
        changes: {
          amount: { old: null, new: body.amountCents },
          reason: { old: null, new: body.reason ?? null },
          refundId: { old: null, new: refund.id },
        },
      });

      return {
        refundId: refund.id,
        chargeId: refundable.id,
        amountCents: body.amountCents,
        status: refund.status,
      };
    },
  );

  // ===== Support inbox (#6) =====

  fastify.get(
    '/api/v1/admin/support-tickets',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request) => {
      const query = z.object({
        status: z.enum(['open', 'replied', 'closed', 'all']).default('open'),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }).parse(request.query);

      const rows = await fastify.db
        .select({
          id: supportTickets.id,
          ref: supportTickets.ref,
          tenantId: supportTickets.tenantId,
          tenantName: tenants.name,
          userEmail: supportTickets.userEmail,
          category: supportTickets.category,
          subject: supportTickets.subject,
          status: supportTickets.status,
          emailSent: supportTickets.emailSent,
          createdAt: supportTickets.createdAt,
          closedAt: supportTickets.closedAt,
        })
        .from(supportTickets)
        .leftJoin(tenants, eq(tenants.id, supportTickets.tenantId))
        .where(query.status === 'all' ? sql`true` : eq(supportTickets.status, query.status))
        .orderBy(desc(supportTickets.createdAt))
        .limit(query.limit);

      return rows;
    },
  );

  fastify.get(
    '/api/v1/admin/support-tickets/:id',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [row] = await fastify.db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, id))
        .limit(1);
      if (!row) { reply.code(404); return { error: 'NOT_FOUND' }; }
      return row;
    },
  );

  fastify.patch(
    '/api/v1/admin/support-tickets/:id',
    { preHandler: [fastify.authenticate, superAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z.object({
        status: z.enum(['open', 'replied', 'closed']),
      }).parse(request.body);

      const patch: Record<string, unknown> = { status: body.status, updatedAt: new Date() };
      if (body.status === 'closed') patch.closedAt = new Date();

      const [updated] = await fastify.db
        .update(supportTickets)
        .set(patch)
        .where(eq(supportTickets.id, id))
        .returning();
      if (!updated) { reply.code(404); return { error: 'NOT_FOUND' }; }

      await logAudit(fastify.db, {
        tenantId: updated.tenantId ?? request.user.tid,
        actorType: 'super_admin',
        actorId: request.user.sub,
        action: 'support_ticket.status_change',
        entityType: 'support_ticket',
        entityId: id,
        changes: { status: { old: null, new: body.status } },
      });

      return updated;
    },
  );
}
