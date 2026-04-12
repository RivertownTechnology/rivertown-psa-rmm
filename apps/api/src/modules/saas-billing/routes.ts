/**
 * SaaS billing — ForgePSA charging tenants for their subscription.
 *
 * Distinct from apps/api/src/modules/integrations/stripe.ts, which is the
 * per-tenant Stripe integration that MSPs use to charge THEIR customers.
 * Here we use the platform-level Stripe account configured in system_configs.
 */
import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { eq, and, inArray, asc } from 'drizzle-orm';
import { z } from 'zod';
import { tenants, users } from '@rivertown/db';
import { readSystemConfig } from '../admin/routes.js';
import { invalidateTenantSubscriptionCache } from '../../common/tenant-subscription-cache.js';

interface StripeSystemConfig {
  secretKey?: string;
  webhookSecret?: string;
  publishableKey?: string;
  starterPriceId?: string;
  proPriceId?: string;
}

async function getPlatformStripe(
  db: FastifyInstance['db'],
): Promise<{ stripe: Stripe; cfg: StripeSystemConfig } | null> {
  const cfg = (await readSystemConfig(db, 'stripe')) as StripeSystemConfig;
  if (!cfg.secretKey) return null;
  return { stripe: new Stripe(cfg.secretKey), cfg };
}

/**
 * Create a Stripe Customer for a tenant if one doesn't exist yet.
 * Called from signup and lazily from checkout if the customer was never created
 * (e.g. because Stripe wasn't configured at signup time).
 */
export async function ensureStripeCustomer(
  db: FastifyInstance['db'],
  tenantId: string,
): Promise<string | null> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return null;
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId;

  const platform = await getPlatformStripe(db);
  if (!platform) return null;

  // Pull the earliest owner/admin for email. Deterministic and resilient to user changes.
  const [admin] = await db
    .select({ email: users.email, displayName: users.displayName })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        inArray(users.role, ['owner', 'admin']),
      ),
    )
    .orderBy(asc(users.createdAt))
    .limit(1);

  const customer = await platform.stripe.customers.create({
    name: tenant.name,
    email: admin?.email,
    metadata: {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    },
  });

  await db
    .update(tenants)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  return customer.id;
}

export async function saasBillingRoutes(fastify: FastifyInstance) {
  // ===== Create Checkout Session =====
  fastify.post(
    '/api/v1/billing/checkout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z.object({
        plan: z.enum(['starter', 'pro']),
      }).parse(request.body);

      const platform = await getPlatformStripe(fastify.db);
      if (!platform) {
        reply.code(503);
        return {
          error: 'BILLING_NOT_CONFIGURED',
          message: 'Billing is not configured yet. Contact support@forgepsa.com to activate your plan.',
        };
      }

      const priceId = body.plan === 'starter' ? platform.cfg.starterPriceId : platform.cfg.proPriceId;
      if (!priceId) {
        reply.code(503);
        return {
          error: 'PRICE_NOT_CONFIGURED',
          message: `${body.plan} plan pricing is not configured.`,
        };
      }

      const customerId = await ensureStripeCustomer(fastify.db, request.user.tid);
      if (!customerId) {
        reply.code(500);
        return { error: 'STRIPE_CUSTOMER_FAILED' };
      }

      // Count billable users (owner/admin/tech) so quantity matches the per-seat price
      const tenantUsers = await fastify.db
        .select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.tenantId, request.user.tid));
      const seatCount = Math.max(
        1,
        tenantUsers.filter((u) => u.isActive && ['owner', 'admin', 'tech'].includes(u.role)).length,
      );

      const appUrl = 'https://app.forgepsa.com';
      const session = await platform.stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: seatCount }],
        allow_promotion_codes: true,
        success_url: `${appUrl}/billing?checkout=success`,
        cancel_url: `${appUrl}/billing?checkout=cancelled`,
        subscription_data: {
          metadata: { tenantId: request.user.tid, plan: body.plan },
        },
        metadata: { tenantId: request.user.tid, plan: body.plan },
      });

      return { checkoutUrl: session.url };
    },
  );

  // ===== Billing Portal (manage payment method, see invoices, cancel) =====
  fastify.post(
    '/api/v1/billing/portal',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const platform = await getPlatformStripe(fastify.db);
      if (!platform) {
        reply.code(503);
        return { error: 'BILLING_NOT_CONFIGURED' };
      }
      const customerId = await ensureStripeCustomer(fastify.db, request.user.tid);
      if (!customerId) {
        reply.code(500);
        return { error: 'NO_CUSTOMER' };
      }

      const portal = await platform.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: 'https://app.forgepsa.com/billing',
      });
      return { portalUrl: portal.url };
    },
  );

  // ===== Webhook =====
  fastify.post(
    '/api/v1/stripe/billing-webhook',
    {
      config: { public: true, rateLimit: { max: 200, timeWindow: '1 minute' } } as any,
    },
    async (request, reply) => {
      const sig = request.headers['stripe-signature'] as string | undefined;
      const rawBody = (request as any).rawBody as string | undefined;
      if (!sig || !rawBody) {
        reply.code(400);
        return { error: 'MISSING_SIGNATURE' };
      }

      const platform = await getPlatformStripe(fastify.db);
      if (!platform || !platform.cfg.webhookSecret) {
        reply.code(503);
        return { error: 'WEBHOOK_NOT_CONFIGURED' };
      }

      let event: Stripe.Event;
      try {
        event = platform.stripe.webhooks.constructEvent(rawBody, sig, platform.cfg.webhookSecret);
      } catch (err) {
        request.log.warn({ err }, '[SAAS-BILLING] Webhook signature invalid');
        reply.code(400);
        return { error: 'INVALID_SIGNATURE' };
      }

      request.log.info({ type: event.type, id: event.id }, '[SAAS-BILLING] Webhook received');

      // Webhook idempotency — Stripe retries events. Dedupe by event id in Redis (1h TTL).
      const { getRedis } = await import('../../common/token-blacklist.js');
      const redis = getRedis();
      if (redis) {
        const dedupeKey = `stripe:evt:${event.id}`;
        const first = await redis.set(dedupeKey, '1', 'EX', 3600, 'NX');
        if (first === null) {
          request.log.info({ id: event.id }, '[SAAS-BILLING] Duplicate webhook event — skipping');
          return { received: true, duplicate: true };
        }
      }

      // Track tenant updated by this event so we can invalidate cache once
      let affectedTenantId: string | null = null;

      // Helper: find tenant by stripe customer id
      async function findTenantByCustomer(customerId: string): Promise<string | null> {
        const [t] = await fastify.db
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.stripeCustomerId, customerId))
          .limit(1);
        return t?.id ?? null;
      }

      function planFromPriceId(priceId: string | null | undefined): 'starter' | 'pro' | null {
        if (!priceId) return null;
        if (priceId === platform!.cfg.starterPriceId) return 'starter';
        if (priceId === platform!.cfg.proPriceId) return 'pro';
        return null;
      }

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const tenantId = (session.metadata?.tenantId as string) || null;
          if (tenantId && session.subscription) {
            await fastify.db
              .update(tenants)
              .set({
                stripeSubscriptionId: session.subscription as string,
                subscriptionStatus: 'active',
                pastDueAt: null,
                updatedAt: new Date(),
              })
              .where(eq(tenants.id, tenantId));
            affectedTenantId = tenantId;
          }
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const tenantId = await findTenantByCustomer(sub.customer as string);
          if (!tenantId) break;
          affectedTenantId = tenantId;

          const status: string = sub.status;
          let newStatus: 'active' | 'past_due' | 'cancelled' | 'trial' = 'active';
          if (status === 'past_due' || status === 'unpaid') newStatus = 'past_due';
          else if (status === 'canceled' || status === 'incomplete_expired') newStatus = 'cancelled';
          else if (status === 'trialing' || status === 'active') newStatus = 'active';

          const priceId = sub.items.data[0]?.price?.id;
          const plan = planFromPriceId(priceId);

          const patch: Record<string, unknown> = {
            stripeSubscriptionId: sub.id,
            subscriptionStatus: newStatus,
            updatedAt: new Date(),
          };
          if (plan) patch.planTier = plan;
          if (newStatus === 'active') patch.pastDueAt = null;

          await fastify.db.update(tenants).set(patch).where(eq(tenants.id, tenantId));
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const tenantId = await findTenantByCustomer(sub.customer as string);
          if (!tenantId) break;
          await fastify.db
            .update(tenants)
            .set({ subscriptionStatus: 'cancelled', updatedAt: new Date() })
            .where(eq(tenants.id, tenantId));
          affectedTenantId = tenantId;
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const tenantId = await findTenantByCustomer(invoice.customer as string);
          if (!tenantId) break;
          // Stamp past_due_at on first failure so the 30-day grace clock starts ticking
          const [current] = await fastify.db
            .select({ pastDueAt: tenants.pastDueAt })
            .from(tenants)
            .where(eq(tenants.id, tenantId))
            .limit(1);
          await fastify.db
            .update(tenants)
            .set({
              subscriptionStatus: 'past_due',
              pastDueAt: current?.pastDueAt ?? new Date(),
              updatedAt: new Date(),
            })
            .where(eq(tenants.id, tenantId));
          affectedTenantId = tenantId;
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const tenantId = await findTenantByCustomer(invoice.customer as string);
          if (!tenantId) break;
          await fastify.db
            .update(tenants)
            .set({
              subscriptionStatus: 'active',
              pastDueAt: null,
              updatedAt: new Date(),
            })
            .where(eq(tenants.id, tenantId));
          affectedTenantId = tenantId;
          break;
        }

        default:
          break;
      }

      if (affectedTenantId) {
        await invalidateTenantSubscriptionCache(affectedTenantId);
      }

      return { received: true };
    },
  );
}
