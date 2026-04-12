import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import {
  tenants, users, tenantSequences, slaPolicies, emailTemplates,
} from '@rivertown/db';

const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),
});

const TRIAL_DAYS = 45;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'msp';
}

async function findAvailableSlug(db: FastifyInstance['db'], base: string): Promise<string> {
  const baseSlug = slugify(base);
  let candidate = baseSlug;
  for (let i = 0; i < 6; i++) {
    const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate)).limit(1);
    if (!existing) return candidate;
    candidate = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  // Last resort: fully random
  return `${baseSlug}-${randomUUID().slice(0, 8)}`;
}

export async function publicSignupRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/v1/signup',
    {
      config: {
        public: true,
        rateLimit: { max: 3, timeWindow: '1 hour' },
      } as any,
    },
    async (request, reply) => {
      const body = signupSchema.parse(request.body);

      // Case-insensitive email existence check — prevents re-signup attacks and
      // duplicate accounts via mixed-case email variations.
      const [existingUser] = await fastify.db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${body.email}`)
        .limit(1);

      if (existingUser) {
        reply.code(409);
        return {
          error: 'EMAIL_IN_USE',
          message: 'An account already exists for this email. Sign in instead.',
        };
      }

      const slug = await findAvailableSlug(fastify.db, body.companyName);
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const passwordHash = await hash(body.password, 12);

      // Fetch default templates outside transaction — purely read-only, and we
      // want to fail fast if something is wrong with the template module.
      let defaultTemplates: Array<Record<string, unknown>> = [];
      try {
        const { getDefaultTemplates } = await import('../../services/template-renderer.js');
        defaultTemplates = getDefaultTemplates() as Array<Record<string, unknown>>;
      } catch (err) {
        request.log.warn({ err }, '[SIGNUP] Failed to load default email templates (continuing without)');
      }

      // Single transaction — all or nothing. Prevents orphan tenants if any
      // downstream insert fails (DB hiccup, constraint violation, etc).
      const { tenant, user } = await fastify.db.transaction(async (tx) => {
        const [t] = await tx
          .insert(tenants)
          .values({
            name: body.companyName,
            slug,
            trialEndsAt,
            subscriptionStatus: 'trial',
            planTier: 'starter',
            subscriptionTier: 'trial',
          })
          .returning();

        const [u] = await tx
          .insert(users)
          .values({
            tenantId: t.id,
            email: body.email,
            passwordHash,
            displayName: `${body.firstName} ${body.lastName}`.trim(),
            role: 'owner',
            isActive: true,
          })
          .returning();

        await tx.insert(tenantSequences).values([
          { tenantId: t.id, sequenceName: 'ticket', currentValue: '0' },
          { tenantId: t.id, sequenceName: 'invoice', currentValue: '0' },
          { tenantId: t.id, sequenceName: 'quote', currentValue: '0' },
        ]);

        await tx.insert(slaPolicies).values([
          {
            tenantId: t.id, name: 'Standard', description: 'Standard SLA for most customers', isDefault: true,
            criticalResponseMinutes: 60, criticalResolutionMinutes: 240,
            highResponseMinutes: 240, highResolutionMinutes: 480,
            mediumResponseMinutes: 480, mediumResolutionMinutes: 1440,
            lowResponseMinutes: 1440, lowResolutionMinutes: 2880,
          },
          {
            tenantId: t.id, name: 'Premium', description: 'Premium SLA for priority customers', isDefault: false,
            criticalResponseMinutes: 30, criticalResolutionMinutes: 120,
            highResponseMinutes: 60, highResolutionMinutes: 240,
            mediumResponseMinutes: 240, mediumResolutionMinutes: 480,
            lowResponseMinutes: 480, lowResolutionMinutes: 1440,
          },
        ]);

        if (defaultTemplates.length > 0) {
          await tx.insert(emailTemplates).values(
            defaultTemplates.map((tmpl) => ({ tenantId: t.id, ...tmpl, isDefault: true }) as any),
          );
        }

        return { tenant: t, user: u };
      });

      // Issue tokens so marketing site can redirect user directly into the app signed in
      const accessToken = fastify.jwt.sign(
        { jti: randomUUID(), sub: user.id, tid: tenant.id, role: user.role, type: 'access' as const },
        { expiresIn: fastify.config.JWT_EXPIRES_IN },
      );
      const refreshToken = fastify.jwt.sign(
        { jti: randomUUID(), sub: user.id, tid: tenant.id, role: user.role, type: 'refresh' as const },
        { expiresIn: fastify.config.REFRESH_TOKEN_EXPIRES_IN },
      );

      request.log.info(
        { tenantId: tenant.id, userId: user.id, slug, trialEndsAt },
        '[SIGNUP] New tenant created',
      );

      // Fire-and-forget: welcome email + Stripe customer creation.
      // Both must never block signup — if either is misconfigured, the signup
      // still succeeds and the UI flow continues.
      void (async () => {
        try {
          const { ensureStripeCustomer } = await import('../saas-billing/routes.js');
          await ensureStripeCustomer(fastify.db, tenant.id);
        } catch (err) {
          request.log.warn({ err, tenantId: tenant.id }, '[SIGNUP] Stripe customer creation failed (non-fatal)');
        }

        try {
          const { sendWelcomeEmail } = await import('../../services/system-mail.js');
          await sendWelcomeEmail(fastify.db, {
            to: body.email,
            firstName: body.firstName,
            companyName: body.companyName,
            trialEndsAt,
          });
        } catch (err) {
          request.log.warn({ err, tenantId: tenant.id }, '[SIGNUP] Welcome email failed (non-fatal)');
        }
      })();

      reply.code(201);
      return {
        accessToken,
        refreshToken,
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, trialEndsAt },
        user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      };
    },
  );

  // Super-admin: extend a tenant's trial by N days
  fastify.post(
    '/api/v1/admin/tenants/:tenantId/extend-trial',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const caller = request.user;

      // Verify caller is super-admin
      const [callerUser] = await fastify.db
        .select({ isSuperAdmin: users.isSuperAdmin })
        .from(users)
        .where(and(eq(users.id, caller.sub), eq(users.tenantId, caller.tid)))
        .limit(1);

      if (!callerUser?.isSuperAdmin) {
        reply.code(403);
        return { error: 'FORBIDDEN', message: 'Super-admin access required' };
      }

      const { tenantId } = request.params as { tenantId: string };
      const body = z.object({ days: z.number().int().min(1).max(365) }).parse(request.body);

      const [tenant] = await fastify.db
        .select({ id: tenants.id, trialEndsAt: tenants.trialEndsAt })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant) {
        reply.code(404);
        return { error: 'NOT_FOUND', message: 'Tenant not found' };
      }

      // Extend from whichever is later: current trialEndsAt, or now
      const base = tenant.trialEndsAt && tenant.trialEndsAt > new Date() ? tenant.trialEndsAt : new Date();
      const newTrialEndsAt = new Date(base.getTime() + body.days * 24 * 60 * 60 * 1000);

      await fastify.db
        .update(tenants)
        .set({
          trialEndsAt: newTrialEndsAt,
          subscriptionStatus: 'trial',
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));

      request.log.info(
        { tenantId, days: body.days, newTrialEndsAt, by: caller.sub },
        '[ADMIN] Trial extended',
      );

      return { tenantId, trialEndsAt: newTrialEndsAt, extendedDays: body.days };
    },
  );

  // Avoid unused-import warning; sql may be useful for future atomic operations
  void sql;
}
