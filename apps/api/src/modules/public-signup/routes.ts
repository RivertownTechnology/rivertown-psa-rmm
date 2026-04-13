import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import {
  tenants, users, tenantSequences, slaPolicies, emailTemplates, serviceCatalogItems,
} from '@rivertown/db';

// Base schema — required for every signup. Kept minimal so older clients keep working.
const signupSchema = z.object({
  // Core identity (required)
  companyName: z.string().trim().min(2).max(120),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),

  // Enriched onboarding — all optional. Falls back to sensible defaults.
  companyType: z.enum(['msp', 'internal_it']).optional(),
  companySize: z.enum(['1-5', '6-20', '21-50', '50+']).optional(),
  industry: z.string().trim().max(60).optional(),
  currentPsa: z.enum(['connectwise', 'halopsa', 'autotask', 'syncro', 'superops', 'other', 'none']).optional(),
  phone: z.string().trim().max(30).optional(),

  // MSP-specific config (ignored for Internal IT)
  billsClients: z.boolean().optional(),
  billingModel: z.enum(['per_user', 'per_device', 'flat_rate', 'hybrid', 'none']).optional(),
  defaultHourlyRate: z.number().int().min(0).max(10000).optional(), // whole dollars
  currency: z.string().trim().length(3).optional(), // ISO 4217
  timezone: z.string().trim().max(60).optional(),

  // Internal IT-specific config
  supportedUsersRange: z.enum(['1-50', '51-200', '201-1000', '1000+']).optional(),
  needs: z.array(z.enum(['ticketing', 'asset_tracking', 'change_management', 'knowledge_base'])).optional(),
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

/**
 * Seed a starter catalog item tailored to the customer's billing model so they
 * have something to quote or invoice against on day one.
 */
function buildStarterCatalogItem(
  billingModel: string,
  billableRateCents: number,
): Record<string, unknown> | null {
  switch (billingModel) {
    case 'per_user':
      return {
        name: 'Managed Services — Per User',
        description: 'Monthly managed services fee per supported end user.',
        sku: 'MS-USER',
        category: 'Managed Services',
        itemType: 'recurring',
        defaultUnitPriceCents: 10000, // $100/user/mo — customer tweaks later
        taxable: true,
      };
    case 'per_device':
      return {
        name: 'Managed Services — Per Device',
        description: 'Monthly managed services fee per supported device.',
        sku: 'MS-DEVICE',
        category: 'Managed Services',
        itemType: 'recurring',
        defaultUnitPriceCents: 7500, // $75/device/mo
        taxable: true,
      };
    case 'flat_rate':
      return {
        name: 'Managed Services — Flat Rate',
        description: 'Flat monthly managed services agreement.',
        sku: 'MS-FLAT',
        category: 'Managed Services',
        itemType: 'recurring',
        defaultUnitPriceCents: 500000, // $5,000/mo starter
        taxable: true,
      };
    case 'hybrid':
      return {
        name: 'Managed Services — Base Fee',
        description: 'Monthly base fee for managed services, add-ons billed separately.',
        sku: 'MS-BASE',
        category: 'Managed Services',
        itemType: 'recurring',
        defaultUnitPriceCents: 150000, // $1,500/mo base
        taxable: true,
      };
    default:
      // Hourly labor catalog item — universal regardless of billing model
      return {
        name: 'Billable Hour',
        description: 'Standard billable engineering hour.',
        sku: 'LABOR-HR',
        category: 'Labor',
        itemType: 'one_time',
        defaultUnitPriceCents: billableRateCents,
        taxable: true,
      };
  }
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

      // Resolve onboarding defaults — callers without the enriched flow still work.
      const companyType = body.companyType ?? 'msp';
      const isMsp = companyType === 'msp';
      const billsClients = body.billsClients ?? isMsp;
      const billingModel = billsClients ? (body.billingModel ?? null) : 'none';
      const currency = body.currency?.toUpperCase() ?? 'USD';
      const timezone = body.timezone || 'America/New_York';
      const billableRateCents = body.defaultHourlyRate != null
        ? body.defaultHourlyRate * 100
        : 15000; // $150/hr default

      // Preserve the signup context in tenants.settings.onboarding for future
      // product personalization + analytics. Non-hot-path fields live here so we
      // don't add a schema column for every little survey answer.
      const onboardingMeta = {
        companySize: body.companySize ?? null,
        industry: body.industry ?? null,
        currentPsa: body.currentPsa ?? null,
        supportedUsersRange: body.supportedUsersRange ?? null,
        needs: body.needs ?? [],
        completedAt: new Date().toISOString(),
        // In-app onboarding checklist state. Populated lazily by the /settings/onboarding endpoints.
        progress: {} as Record<string, boolean>,
        dismissedAt: null as string | null,
      };

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
            companyType,
            billingModel,
            currency,
            timezone,
            defaultBillableRateCents: billableRateCents,
            settings: { onboarding: onboardingMeta },
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
            phone: body.phone || null,
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

        // Seed a starter service-catalog item so MSPs have something to quote
        // immediately — tailored to the billing model they picked.
        if (billsClients && billingModel && billingModel !== 'none') {
          const starterItem = buildStarterCatalogItem(billingModel, billableRateCents);
          if (starterItem) {
            await tx.insert(serviceCatalogItems).values({ tenantId: t.id, ...starterItem } as any);
          }
        }

        // Internal contract — every tenant needs one so overhead time has somewhere to land.
        const { ensureInternalContract } = await import('@rivertown/db');
        await ensureInternalContract(tx as any, t.id);

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
