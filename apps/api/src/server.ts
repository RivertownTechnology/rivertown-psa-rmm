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
import reportsModule from './modules/reports/index.js';
import attachmentsModule from './modules/attachments/index.js';
import kbModule from './modules/knowledge-base/index.js';
import cannedResponsesModule from './modules/canned-responses/index.js';
import notificationsModule from './modules/notifications/index.js';
import govContractsModule from './modules/gov-contracts/index.js';

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

  // Raw body for Stripe webhooks
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      (req as any).rawBody = body;
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // CORS
  const allowedOrigins = [
    'https://psa.rivertowntechnology.com',
    'https://rivertown-psa-rmm-production.up.railway.app',
    'http://localhost:5173',
    'http://localhost:5174',
  ];
  await fastify.register(cors, {
    origin: config.NODE_ENV === 'development' ? true : allowedOrigins,
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
    if (request.url.startsWith('/api/v1/csat/')) return; // CSAT rating pages are public (customer clicks from email)
    if (request.url.startsWith('/api/v1/invoices/') && request.url.includes('/view')) return; // Public invoice view
    if (request.url.startsWith('/api/v1/invoices/') && request.url.includes('/html')) return; // Public invoice HTML
    if (request.url.startsWith('/api/v1/quotes/') && request.url.includes('/html')) return; // Public quote HTML
    await fastify.authenticate(request, reply);
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
  await loadModules(fastify, [customersModule, contactsModule, sitesModule, assetsModule, contractsModule, invoicesModule, quotesModule, serviceCatalogModule, settingsModule, ticketsModule, dispatchModule, portalModule, publicApiModule, reportsModule, attachmentsModule, kbModule, cannedResponsesModule, notificationsModule, govContractsModule]);

  // Start Pax8 auto-sync scheduler
  const { startPax8SyncScheduler } = await import('./services/pax8-sync.js');
  startPax8SyncScheduler(db);

  // Start QuickBooks auto-sync scheduler
  const { startQBOSyncScheduler } = await import('./services/qbo-sync.js');
  startQBOSyncScheduler(db);

  // Start ticket auto-close scheduler
  const { startTicketAutoCloseScheduler } = await import('./services/ticket-auto-close.js');
  startTicketAutoCloseScheduler(db);

  // Start ScreenConnect auto-sync scheduler
  const { startScreenConnectSyncScheduler } = await import('./services/screenconnect-sync.js');
  startScreenConnectSyncScheduler(db);

  // Start N-central auto-sync scheduler
  const { startNCentralSyncScheduler } = await import('./services/ncentral-sync.js');
  startNCentralSyncScheduler(db);

  // Start recurring ticket scheduler
  const { startRecurringTicketScheduler } = await import('./services/recurring-tickets.js');
  startRecurringTicketScheduler(db);

  // Start invoice auto-send scheduler
  const { startInvoiceAutoSendScheduler } = await import('./services/invoice-auto-send.js');
  startInvoiceAutoSendScheduler(db);

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

  return fastify;
}
