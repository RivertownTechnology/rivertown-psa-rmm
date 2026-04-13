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

  // =====================================================================
  // Self-service subscription management (tenant-facing)
  //
  // All routes below are authenticated and operate on the CALLER's tenant.
  // Owner/admin role required — techs can't see billing details.
  // =====================================================================

  const requireAdminRole = async (request: any, reply: any) => {
    if (!['owner', 'admin'].includes(request.user?.role)) {
      reply.code(403).send({ error: 'FORBIDDEN', message: 'Owner or admin role required.' });
    }
  };

  // GET /api/v1/billing/subscription — snapshot of plan, status, next bill, payment method
  fastify.get(
    '/api/v1/billing/subscription',
    { preHandler: [fastify.authenticate, requireAdminRole] },
    async (request, reply) => {
      const platform = await getPlatformStripe(fastify.db);
      if (!platform) {
        reply.code(503);
        return { error: 'BILLING_NOT_CONFIGURED' };
      }

      const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, request.user.tid)).limit(1);
      if (!tenant) { reply.code(404); return { error: 'NOT_FOUND' }; }

      const result: Record<string, unknown> = {
        plan: tenant.planTier,
        status: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt,
        pastDueAt: tenant.pastDueAt,
        currency: tenant.currency,
        stripeCustomerId: tenant.stripeCustomerId,
        hasSubscription: !!tenant.stripeSubscriptionId,
      };

      if (tenant.stripeCustomerId && tenant.stripeSubscriptionId) {
        try {
          const sub = await platform.stripe.subscriptions.retrieve(tenant.stripeSubscriptionId, {
            expand: ['default_payment_method', 'latest_invoice'],
          });
          const item = sub.items.data[0];
          result.subscription = {
            id: sub.id,
            status: sub.status,
            currentPeriodEnd: (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            quantity: item?.quantity ?? 1,
            unitAmountCents: item?.price?.unit_amount ?? 0,
            interval: item?.price?.recurring?.interval ?? 'month',
          };
          const pm = (sub as any).default_payment_method;
          if (pm && typeof pm === 'object' && pm.card) {
            result.defaultPaymentMethod = {
              id: pm.id,
              brand: pm.card.brand,
              last4: pm.card.last4,
              expMonth: pm.card.exp_month,
              expYear: pm.card.exp_year,
            };
          }
        } catch (err) {
          request.log.warn({ err }, '[BILLING] Failed to expand Stripe subscription');
        }
      }

      return result;
    },
  );

  // GET /api/v1/billing/payment-methods — list cards attached to the Stripe customer
  fastify.get(
    '/api/v1/billing/payment-methods',
    { preHandler: [fastify.authenticate, requireAdminRole] },
    async (request, reply) => {
      const platform = await getPlatformStripe(fastify.db);
      if (!platform) { reply.code(503); return { error: 'BILLING_NOT_CONFIGURED' }; }
      const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, request.user.tid)).limit(1);
      if (!tenant?.stripeCustomerId) return { methods: [], defaultId: null };

      const methods = await platform.stripe.paymentMethods.list({
        customer: tenant.stripeCustomerId,
        type: 'card',
      });
      const customer = await platform.stripe.customers.retrieve(tenant.stripeCustomerId);
      const defaultId = (customer as any)?.invoice_settings?.default_payment_method ?? null;

      return {
        methods: methods.data.map((m) => ({
          id: m.id,
          brand: m.card?.brand,
          last4: m.card?.last4,
          expMonth: m.card?.exp_month,
          expYear: m.card?.exp_year,
          isDefault: m.id === defaultId,
        })),
        defaultId,
      };
    },
  );

  // POST /api/v1/billing/setup-intent — Stripe Elements uses this to securely add a new card
  fastify.post(
    '/api/v1/billing/setup-intent',
    { preHandler: [fastify.authenticate, requireAdminRole] },
    async (request, reply) => {
      const platform = await getPlatformStripe(fastify.db);
      if (!platform) { reply.code(503); return { error: 'BILLING_NOT_CONFIGURED' }; }

      const customerId = await ensureStripeCustomer(fastify.db, request.user.tid);
      if (!customerId) { reply.code(500); return { error: 'NO_CUSTOMER' }; }

      const setupIntent = await platform.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
      });

      return {
        clientSecret: setupIntent.client_secret,
        publishableKey: platform.cfg.publishableKey,
      };
    },
  );

  // PUT /api/v1/billing/default-payment-method — set the default card for renewals
  fastify.put(
    '/api/v1/billing/default-payment-method',
    { preHandler: [fastify.authenticate, requireAdminRole] },
    async (request, reply) => {
      const body = z.object({ paymentMethodId: z.string() }).parse(request.body);
      const platform = await getPlatformStripe(fastify.db);
      if (!platform) { reply.code(503); return { error: 'BILLING_NOT_CONFIGURED' }; }
      const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, request.user.tid)).limit(1);
      if (!tenant?.stripeCustomerId) { reply.code(400); return { error: 'NO_STRIPE_CUSTOMER' }; }

      await platform.stripe.customers.update(tenant.stripeCustomerId, {
        invoice_settings: { default_payment_method: body.paymentMethodId },
      });
      // Also apply to existing subscription so renewals use the new card
      if (tenant.stripeSubscriptionId) {
        await platform.stripe.subscriptions.update(tenant.stripeSubscriptionId, {
          default_payment_method: body.paymentMethodId,
        });
      }
      return { ok: true };
    },
  );

  // DELETE /api/v1/billing/payment-methods/:id — detach a card
  fastify.delete(
    '/api/v1/billing/payment-methods/:id',
    { preHandler: [fastify.authenticate, requireAdminRole] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const platform = await getPlatformStripe(fastify.db);
      if (!platform) { reply.code(503); return { error: 'BILLING_NOT_CONFIGURED' }; }
      await platform.stripe.paymentMethods.detach(id);
      reply.code(204).send();
    },
  );

  // GET /api/v1/billing/invoices — last N invoices (status + amount + hosted URL)
  fastify.get(
    '/api/v1/billing/invoices',
    { preHandler: [fastify.authenticate, requireAdminRole] },
    async (request, reply) => {
      const platform = await getPlatformStripe(fastify.db);
      if (!platform) { reply.code(503); return { error: 'BILLING_NOT_CONFIGURED' }; }
      const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, request.user.tid)).limit(1);
      if (!tenant?.stripeCustomerId) return { invoices: [] };

      const list = await platform.stripe.invoices.list({
        customer: tenant.stripeCustomerId,
        limit: 20,
      });
      return {
        invoices: list.data.map((i) => ({
          id: i.id,
          number: i.number,
          status: i.status,
          amountCents: i.total,
          currency: i.currency,
          createdAt: new Date(i.created * 1000).toISOString(),
          paidAt: i.status_transitions.paid_at ? new Date(i.status_transitions.paid_at * 1000).toISOString() : null,
          hostedInvoiceUrl: i.hosted_invoice_url,
          invoicePdfUrl: i.invoice_pdf,
        })),
      };
    },
  );

  // PUT /api/v1/billing/subscription — change plan (immediate proration)
  fastify.put(
    '/api/v1/billing/subscription',
    { preHandler: [fastify.authenticate, requireAdminRole] },
    async (request, reply) => {
      const body = z.object({ plan: z.enum(['starter', 'pro']) }).parse(request.body);
      const platform = await getPlatformStripe(fastify.db);
      if (!platform) { reply.code(503); return { error: 'BILLING_NOT_CONFIGURED' }; }

      const priceId = body.plan === 'starter' ? platform.cfg.starterPriceId : platform.cfg.proPriceId;
      if (!priceId) { reply.code(503); return { error: 'PRICE_NOT_CONFIGURED' }; }

      const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, request.user.tid)).limit(1);
      if (!tenant?.stripeSubscriptionId) { reply.code(400); return { error: 'NO_ACTIVE_SUBSCRIPTION' }; }

      const sub = await platform.stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
      const item = sub.items.data[0];
      if (!item) { reply.code(400); return { error: 'MALFORMED_SUBSCRIPTION' }; }

      const updated = await platform.stripe.subscriptions.update(tenant.stripeSubscriptionId, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: 'always_invoice',
        metadata: { tenantId: request.user.tid, plan: body.plan },
      });

      return { subscriptionId: updated.id, plan: body.plan };
    },
  );

  // POST /api/v1/billing/cancel — cancel at period end (or immediately)
  fastify.post(
    '/api/v1/billing/cancel',
    { preHandler: [fastify.authenticate, requireAdminRole] },
    async (request, reply) => {
      const body = z.object({
        mode: z.enum(['at_period_end', 'immediately']).default('at_period_end'),
        reason: z.string().max(500).optional(),
      }).parse(request.body);

      const platform = await getPlatformStripe(fastify.db);
      if (!platform) { reply.code(503); return { error: 'BILLING_NOT_CONFIGURED' }; }
      const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, request.user.tid)).limit(1);
      if (!tenant?.stripeSubscriptionId) { reply.code(400); return { error: 'NO_ACTIVE_SUBSCRIPTION' }; }

      if (body.mode === 'immediately') {
        await platform.stripe.subscriptions.cancel(tenant.stripeSubscriptionId, {
          cancellation_details: { comment: body.reason ?? 'requested by customer' },
        });
      } else {
        await platform.stripe.subscriptions.update(tenant.stripeSubscriptionId, {
          cancel_at_period_end: true,
          cancellation_details: { comment: body.reason ?? 'requested by customer' },
        });
      }

      request.log.info({ tenantId: request.user.tid, mode: body.mode }, '[BILLING] Subscription cancelled');
      return { ok: true, mode: body.mode };
    },
  );

  // POST /api/v1/billing/reactivate — undo a pending cancellation (if period hasn't ended)
  fastify.post(
    '/api/v1/billing/reactivate',
    { preHandler: [fastify.authenticate, requireAdminRole] },
    async (request, reply) => {
      const platform = await getPlatformStripe(fastify.db);
      if (!platform) { reply.code(503); return { error: 'BILLING_NOT_CONFIGURED' }; }
      const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, request.user.tid)).limit(1);
      if (!tenant?.stripeSubscriptionId) { reply.code(400); return { error: 'NO_ACTIVE_SUBSCRIPTION' }; }

      await platform.stripe.subscriptions.update(tenant.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
      return { ok: true };
    },
  );
}
