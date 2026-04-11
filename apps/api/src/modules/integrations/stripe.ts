import { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'crypto';
import Stripe from 'stripe';
import { eq, and } from 'drizzle-orm';
import { invoices, payments, customers, integrationConfigs } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';

async function getStripeFromDb(db: any, tenantId: string): Promise<{ stripe: Stripe; webhookSecret: string } | null> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'stripe')))
    .limit(1);
  if (!config?.isEnabled) return null;
  const creds = (config.credentials ?? {}) as Record<string, string>;
  if (!creds.secretKey) return null;
  return { stripe: new Stripe(creds.secretKey), webhookSecret: creds.webhookSecret || '' };
}

// For webhook — try each tenant's webhook secret to find the correct one via signature verification
async function verifyWebhookForTenant(
  db: any, rawBody: string, sig: string,
): Promise<{ stripe: Stripe; event: Stripe.Event; tenantId: string } | null> {
  const configs = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.provider, 'stripe'), eq(integrationConfigs.isEnabled, true)));

  for (const config of configs) {
    const creds = (config.credentials ?? {}) as Record<string, string>;
    if (!creds.secretKey || !creds.webhookSecret) continue;

    const stripe = new Stripe(creds.secretKey);
    try {
      const event = stripe.webhooks.constructEvent(rawBody, sig, creds.webhookSecret);
      return { stripe, event, tenantId: config.tenantId };
    } catch {
      // Signature didn't match this tenant's secret — try next
    }
  }
  return null;
}

export async function stripeRoutes(fastify: FastifyInstance) {
  // Save Stripe settings
  fastify.get('/api/v1/settings/stripe', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const [config] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'stripe')))
      .limit(1);
    const creds = (config?.credentials ?? {}) as Record<string, string>;
    return {
      isEnabled: config?.isEnabled ?? false,
      secretKey: creds.secretKey ? '••••••••' + creds.secretKey.slice(-4) : '',
      webhookSecret: creds.webhookSecret ? '••••••••' + creds.webhookSecret.slice(-4) : '',
      publishableKey: creds.publishableKey || '',
    };
  });

  fastify.put('/api/v1/settings/stripe', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const body = request.body as { secretKey?: string; webhookSecret?: string; publishableKey?: string; isEnabled: boolean };
    const [existing] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'stripe')))
      .limit(1);

    const prevCreds = (existing?.credentials ?? {}) as Record<string, string>;
    const credentials: Record<string, string> = {
      secretKey: body.secretKey?.startsWith('sk_') ? body.secretKey : prevCreds.secretKey || '',
      webhookSecret: body.webhookSecret?.startsWith('whsec_') ? body.webhookSecret : prevCreds.webhookSecret || '',
      publishableKey: body.publishableKey || prevCreds.publishableKey || '',
    };

    if (existing) {
      await fastify.db.update(integrationConfigs).set({
        isEnabled: body.isEnabled, credentials, updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, existing.id));
    } else {
      await fastify.db.insert(integrationConfigs).values({
        tenantId: request.tenantId, provider: 'stripe',
        isEnabled: body.isEnabled, credentials,
      });
    }
    return { success: true };
  });

  // Create Stripe checkout session for an invoice
  fastify.post('/api/v1/invoices/:id/payment-link', {
    preHandler: [fastify.authenticate, requirePermission('invoices:write')]
  }, async (request) => {
    const stripeData = await getStripeFromDb(fastify.db, request.tenantId);
    if (!stripeData) throw new Error('Stripe is not configured. Go to Settings to set up Stripe.');
    const { stripe } = stripeData;

    const { id } = request.params as { id: string };
    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const balanceCents = invoice.totalCents - invoice.amountPaidCents;
    if (balanceCents <= 0) return { url: null, message: 'Invoice is already paid' };

    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, request.tenantId))).limit(1);

    // Get or create Stripe customer
    let stripeCustomerId = customer?.stripeCustomerId;
    if (!stripeCustomerId && customer) {
      const stripeCustomer = await stripe.customers.create({
        name: customer.name,
        email: customer.billingEmail || undefined,
        phone: customer.phone || undefined,
        metadata: { tenantId: request.tenantId, customerId: customer.id },
      });
      stripeCustomerId = stripeCustomer.id;
      await fastify.db.update(customers).set({ stripeCustomerId }).where(eq(customers.id, customer.id));
    }

    // Build the success/cancel URLs from allowed origins only (prevent open redirect)
    const allowedOrigins = ['https://psa.rivertowntechnology.com', 'http://localhost:5173'];
    const requestOrigin = request.headers.origin || '';
    const origin = allowedOrigins.includes(requestOrigin) ? requestOrigin : 'https://psa.rivertowntechnology.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId || undefined,
      customer_email: !stripeCustomerId ? (customer?.billingEmail || undefined) : undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: balanceCents,
          product_data: {
            name: `Invoice #${invoice.invoiceNumber}`,
            description: invoice.notes || `Payment for Invoice #${invoice.invoiceNumber}`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        tenantId: request.tenantId,
        invoiceId: invoice.id,
        invoiceNumber: String(invoice.invoiceNumber),
      },
      success_url: `${origin}/billing/invoices/${invoice.id}?payment=success`,
      cancel_url: `${origin}/billing/invoices/${invoice.id}?payment=cancelled`,
    });

    // Store Stripe session/invoice ID
    if (session.id) {
      await fastify.db.update(invoices).set({
        stripeInvoiceId: session.id,
        updatedAt: new Date(),
      }).where(eq(invoices.id, id));
    }

    return { url: session.url, sessionId: session.id };
  });

  // Stripe webhook handler — processes payment confirmations
  fastify.post('/api/v1/webhooks/stripe', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const sig = request.headers['stripe-signature'] as string;
    if (!sig) {
      reply.code(400).send({ error: 'Missing stripe-signature header' });
      return;
    }

    const rawBody = (request as any).rawBody || JSON.stringify(request.body);

    // Verify signature against all tenant configs — returns the matching tenant
    const verified = await verifyWebhookForTenant(fastify.db, rawBody, sig);
    if (!verified) {
      reply.code(400).send({ error: 'Invalid webhook signature' });
      return;
    }

    const { event } = verified;
    console.log(`[STRIPE] Webhook event: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { tenantId, invoiceId, invoiceNumber } = session.metadata || {};

      if (!tenantId || !invoiceId) {
        console.error('[STRIPE] Missing metadata on checkout session');
        reply.code(200).send({ received: true });
        return;
      }

      const amountCents = session.amount_total || 0;

      console.log(`[STRIPE] Payment received: Invoice #${invoiceNumber}, $${(amountCents / 100).toFixed(2)}`);

      // Record payment
      const [invoice] = await fastify.db.select().from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId))).limit(1);

      if (invoice) {
        const [payment] = await fastify.db.insert(payments).values({
          tenantId,
          invoiceId,
          amountCents,
          paymentMethod: 'stripe',
          stripePaymentIntentId: session.payment_intent as string || session.id,
          paidAt: new Date(),
        }).returning();

        const newPaid = invoice.amountPaidCents + amountCents;
        const newStatus = newPaid >= invoice.totalCents ? 'paid' : invoice.status;

        await fastify.db.update(invoices).set({
          amountPaidCents: newPaid,
          status: newStatus,
          updatedAt: new Date(),
        }).where(eq(invoices.id, invoiceId));

        // Send payment receipt email
        const { sendPaymentReceiptEmail } = await import('../../services/document-email.js');
        sendPaymentReceiptEmail(fastify.db, tenantId, invoiceId, amountCents, fastify.jwt.sign.bind(fastify.jwt))
          .catch(e => console.error('[STRIPE] Receipt email failed:', e));

        // Sync payment to QuickBooks (fire and forget)
        import('../../services/qbo-sync.js').then(({ syncPaymentToQBO }) => {
          syncPaymentToQBO(fastify.db, tenantId, payment.id)
            .catch((e: any) => console.error('[QBO] Stripe payment sync failed:', e));
        });
      }
    }

    reply.code(200).send({ received: true });
  });

  // Get Stripe config status
  fastify.get('/api/v1/settings/stripe/status', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const data = await getStripeFromDb(fastify.db, request.tenantId);
    return { configured: !!data };
  });
}
