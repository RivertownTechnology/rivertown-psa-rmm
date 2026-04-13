import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { createDb, Database } from '@rivertown/db';
import { Config } from './config.js';
import { jwtPlugin } from './auth/jwt.js';
import { tenantContextPlugin } from './common/tenant-context.js';
import { authRoutes } from './auth/routes.js';
import { mfaRoutes } from './auth/mfa.js';
import { googleAuthRoutes } from './auth/google.js';
import { googleEmailRoutes } from './modules/integrations/google-email.js';
import { googleCalendarRoutes } from './modules/integrations/google-calendar.js';
import { stripeRoutes } from './modules/integrations/stripe.js';
import { pax8Routes } from './modules/integrations/pax8.js';
import { quickbooksRoutes } from './modules/integrations/quickbooks.js';
import { aiRoutes } from './modules/ai/routes.js';
import { loadModules } from './modules/registry.js';
import { AppError } from './common/errors.js';
import { ZodError } from 'zod';
// Module imports
import customersModule from './modules/customers/index.js';
import contactsModule from './modules/contacts/index.js';
import sitesModule from './modules/sites/index.js';
import assetsModule from './modules/assets/index.js';
import contractsModule from './modules/contracts/index.js';
import serviceCatalogModule from './modules/service-catalog/index.js';
import invoicesModule from './modules/invoices/index.js';
import quotesModule from './modules/quotes/index.js';
import settingsModule from './modules/settings/index.js';
import ticketsModule from './modules/tickets/index.js';
import dispatchModule from './modules/dispatch/index.js';
import portalModule from './modules/portal/index.js';
import publicApiModule from './modules/public-api/index.js';
import { publicSignupRoutes } from './modules/public-signup/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { saasBillingRoutes } from './modules/saas-billing/routes.js';
import { supportRoutes } from './modules/support/routes.js';
import { importsRoutes } from './modules/imports/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    config: Config;
  }
}

export async function buildServer(config: Config): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Database
  const db = createDb(config.DATABASE_URL);
  fastify.decorate('db', db);
  fastify.decorate('config', config);

  // Redis (for token blacklist)
  const { initRedis } = await import('./common/token-blacklist.js');
  initRedis(config.REDIS_URL);

  // Raw body for Stripe webhooks. Also tolerates empty bodies on POSTs that
  // don't need a payload (e.g. /admin/tenants/:id/impersonate) — without this,
  // JSON.parse('') throws "Unexpected end of JSON input" before the handler runs
  // and the request 500s before any of our route handlers can catch it.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as any).rawBody = body;
    const asString = body as string;
    if (!asString || asString.trim() === '') {
      return done(null, {});
    }
    try {
      done(null, JSON.parse(asString));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // CORS — explicit allowlist for production domains, plus a regex escape hatch
  // for Railway's auto-generated URLs (used before custom DNS is bound).
  // Note: updated 2026-04-12 to fix forgeadmin.forgepsa.com missing from list.
  const prodOrigins = new Set([
    'https://psa.rivertowntechnology.com',
    'https://forgepsa.com',
    'https://www.forgepsa.com',
    'https://app.forgepsa.com',
    'https://portal.forgepsa.com',
    'https://forgeadmin.forgepsa.com',
  ]);
  const devOrigins = new Set([
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
  ]);
  // Railway edge URLs: <service>-production.up.railway.app and <service>-production-<random>.up.railway.app
  const railwayPreviewPattern = /^https:\/\/[a-z0-9-]+(-production)?(-[a-z0-9]+)?\.up\.railway\.app$/;

  await fastify.register(cors, {
    origin: (origin, cb) => {
      // No origin header (same-origin, server-to-server, curl) — allow.
      if (!origin) return cb(null, true);
      if (prodOrigins.has(origin)) return cb(null, true);
      if (railwayPreviewPattern.test(origin)) return cb(null, true);
      if (config.NODE_ENV === 'development' && devOrigins.has(origin)) return cb(null, true);
      cb(new Error(`CORS: origin not allowed: ${origin}`), false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  });

  // Global rate limiting
  await fastify.register(rateLimit, {
    global: false, // Don't apply globally — apply per-route via config
    max: 100,
    timeWindow: '1 minute',
  });

  // Security headers
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '0');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.mailjet.com https://api.stripe.com https://*.intuit.com; frame-ancestors 'none'");
    if (config.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });

  // API request logging with anomaly detection
  const authFailures = new Map<string, { count: number; firstAt: number }>();
  fastify.addHook('onResponse', async (request, reply) => {
    const user = (request as any).user;
    const log: Record<string, unknown> = {
      ts: new Date().toISOString(),
      method: request.method,
      path: request.url.split('?')[0],
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
      ip: request.ip,
      uid: user?.sub,
      tid: user?.tid,
    };

    // Track auth failures for anomaly detection
    if (reply.statusCode === 401 && request.url.includes('/auth/')) {
      const key = request.ip;
      const entry = authFailures.get(key) || { count: 0, firstAt: Date.now() };
      entry.count++;
      authFailures.set(key, entry);

      if (entry.count >= 5 && Date.now() - entry.firstAt < 5 * 60 * 1000) {
        request.log.warn({ ip: request.ip, count: entry.count }, '[SECURITY] Repeated auth failures from IP');
      }

      // Clean old entries every 100 requests
      if (authFailures.size > 100) {
        const cutoff = Date.now() - 5 * 60 * 1000;
        for (const [k, v] of authFailures) { if (v.firstAt < cutoff) authFailures.delete(k); }
      }
    }

    // Log 4xx/5xx and slow requests
    if (reply.statusCode >= 400 || reply.elapsedTime > 5000) {
      request.log.warn(log, `[REQUEST] ${request.method} ${request.url.split('?')[0]} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms`);
    }
  });

  // WebSocket support
  await fastify.register(websocket);
  await fastify.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB for agent builds

  // JWT Auth
  await fastify.register(jwtPlugin, { config });

  // Tenant context
  await fastify.register(tenantContextPlugin);

  // Global auth hook — applies to all routes except those marked public
  fastify.addHook('onRequest', async (request, reply) => {
    if ((request.routeOptions?.config as any)?.public) return;
    // Skip public paths
    if (request.url === '/health') return;
    if (request.url.startsWith('/api/v1/auth/google')) return;
    if (request.url.startsWith('/api/public/')) return;
    await fastify.authenticate(request, reply);
  });

  // Trial enforcement — block writes when trial expired with no active subscription
  fastify.addHook('preHandler', async (request, reply) => {
    if ((request.routeOptions?.config as any)?.public) return;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;

    const user = (request as any).user;
    if (!user?.tid) return; // unauthenticated; other middleware handles it

    // Allow the user to log out, manage billing, reach support, or hit auth endpoints
    // even in read-only mode. Support intake is intentionally available to locked-out
    // tenants so they can ask us for help.
    const url = request.url.split('?')[0];
    if (
      url.startsWith('/api/v1/auth/') ||
      url.startsWith('/api/v1/billing/') ||
      url.startsWith('/api/v1/admin/') ||
      url.startsWith('/api/v1/support/')
    ) return;

    const { getTenantSubscriptionState } = await import('./common/tenant-subscription-cache.js');
    const t = await getTenantSubscriptionState(fastify.db, user.tid);
    if (!t) return;

    const now = Date.now();
    const GRACE_MS = 30 * 24 * 60 * 60 * 1000;

    const trialExpired = t.status === 'trial'
      && t.trialEndsAt != null
      && t.trialEndsAt.getTime() < now;
    const graceExpired = t.status === 'past_due'
      && t.pastDueAt != null
      && now - t.pastDueAt.getTime() > GRACE_MS;

    // Cancelled or past-their-grace accounts are locked out. past_due within the 30-day grace
    // keeps writes working so the customer has time to resolve the card issue.
    const locked = t.status === 'cancelled' || trialExpired || graceExpired;

    if (locked) {
      reply.code(402).send({
        error: 'SUBSCRIPTION_REQUIRED',
        message: trialExpired
          ? 'Your 45-day free trial has ended. Add a subscription to continue making changes.'
          : 'Your subscription is not active. Update billing to continue making changes.',
        subscriptionStatus: t.status,
      });
    }
  });

  // Error handler
  fastify.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    // Fastify validation errors
    if (error.validation) {
      reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: error.message,
      });
      return;
    }

    request.log.error(error);
    reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: config.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  });

  // Health check
  fastify.get('/health', { config: { public: true } as any }, async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Public signup (SaaS onboarding)
  await fastify.register(publicSignupRoutes);

  // ForgePSA super-admin dashboard
  await fastify.register(adminRoutes);

  // SaaS billing — platform-level Stripe for charging tenants
  await fastify.register(saasBillingRoutes);

  // Customer support — ticket intake for ForgePSA customers
  await fastify.register(supportRoutes);

  // Data imports (ConnectWise / Autotask / Halo / CSV) — Pro+
  await fastify.register(importsRoutes);

  // Auth routes
  await fastify.register(authRoutes);
  await fastify.register(mfaRoutes);
  await fastify.register(googleAuthRoutes);
  await fastify.register(googleEmailRoutes);
  await fastify.register(googleCalendarRoutes);
  await fastify.register(stripeRoutes);
  await fastify.register(pax8Routes);
  await fastify.register(quickbooksRoutes);
  await fastify.register(aiRoutes);

  // Load feature modules
  await loadModules(fastify, [customersModule, contactsModule, sitesModule, assetsModule, contractsModule, invoicesModule, quotesModule, serviceCatalogModule, settingsModule, ticketsModule, dispatchModule, portalModule, publicApiModule]);

  // Start Pax8 auto-sync scheduler
  const { startPax8SyncScheduler } = await import('./services/pax8-sync.js');
  startPax8SyncScheduler(db);

  // Start QuickBooks auto-sync scheduler
  const { startQBOSyncScheduler } = await import('./services/qbo-sync.js');
  startQBOSyncScheduler(db);

  // Start email inbox polling (check all tenant inboxes every 30 seconds)
  const { processInboundEmails } = await import('./services/email-to-ticket.js');
  const { tenants } = await import('@rivertown/db');
  let emailPolling = false;
  setInterval(async () => {
    if (emailPolling) return; // Skip if previous poll still running
    emailPolling = true;
    try {
      const allTenants = await db.select({ id: tenants.id }).from(tenants);
      for (const t of allTenants) {
        try {
          const result = await processInboundEmails(db, t.id);
          if (result.processed > 0) {
            console.log(`[EMAIL-POLL] Tenant ${t.id}: processed ${result.processed} emails, ${result.tickets} tickets, ${result.comments} comments`);
          }
        } catch (err) {
          console.error(`[EMAIL-POLL] Tenant ${t.id} failed:`, err);
        }
      }
    } catch (err) {
      console.error('[EMAIL-POLL] Polling failed:', err);
    } finally {
      emailPolling = false;
    }
  }, 5000);

  // Contract-hours maintenance: period resets, expiry alerts, warn-threshold emails.
  // Runs hourly; each sub-task is idempotent and no-ops when nothing is due.
  const { runContractHoursNightly } = await import('./jobs/contract-hours-nightly.js');
  let hoursJobRunning = false;
  setInterval(async () => {
    if (hoursJobRunning) return;
    hoursJobRunning = true;
    try {
      await runContractHoursNightly(db);
    } finally {
      hoursJobRunning = false;
    }
  }, 60 * 60 * 1000);
  // Kick off once at boot so a freshly-started server catches up immediately.
  runContractHoursNightly(db).catch((err) => console.error('[CONTRACT-HOURS] boot run failed:', err));

  return fastify;
}
