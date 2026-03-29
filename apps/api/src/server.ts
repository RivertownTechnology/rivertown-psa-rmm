import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { createDb, Database } from '@rivertown/db';
import { Config } from './config.js';
import { jwtPlugin } from './auth/jwt.js';
import { tenantContextPlugin } from './common/tenant-context.js';
import { authRoutes } from './auth/routes.js';
import { mfaRoutes } from './auth/mfa.js';
import { microsoft365Routes } from './modules/integrations/microsoft365.js';
import { loadModules } from './modules/registry.js';
import { AppError } from './common/errors.js';
import { ZodError } from 'zod';
import { startMqttClient } from './services/mqtt-client.js';

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
import rmmModule from './modules/rmm/index.js';
import portalModule from './modules/portal/index.js';

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

  // CORS
  await fastify.register(cors, {
    origin: config.NODE_ENV === 'development' ? true : false,
    credentials: true,
  });

  // WebSocket support
  await fastify.register(websocket);

  // JWT Auth
  await fastify.register(jwtPlugin, { config });

  // Tenant context
  await fastify.register(tenantContextPlugin);

  // Global auth hook — applies to all routes except those marked public
  fastify.addHook('onRequest', async (request, reply) => {
    if ((request.routeOptions?.config as any)?.public) return;
    // Skip health check
    if (request.url === '/health') return;
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
  await fastify.register(microsoft365Routes);

  // Load feature modules
  await loadModules(fastify, [customersModule, contactsModule, sitesModule, assetsModule, contractsModule, invoicesModule, quotesModule, serviceCatalogModule, settingsModule, ticketsModule, dispatchModule, rmmModule, portalModule]);

  // Start MQTT client for agent communication (after all modules loaded)
  const mqttUrl = config.MQTT_URL || 'mqtt://localhost:1883';
  startMqttClient(db, mqttUrl);

  return fastify;
}
