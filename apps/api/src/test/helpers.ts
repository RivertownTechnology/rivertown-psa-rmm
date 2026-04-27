/**
 * Test helpers for Fastify API tests.
 *
 * Provides a lightweight test Fastify app with JWT auth, tenant context,
 * and helpers to issue authenticated requests without needing a real database.
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fjwt from '@fastify/jwt';
import { randomUUID } from 'crypto';
import { ZodError } from 'zod';
import { AppError } from '../common/errors.js';

// ---------------------------------------------------------------------------
// Test user defaults
// ---------------------------------------------------------------------------

export interface TestUser {
  sub: string;
  tid: string;
  role: string;
  type: 'access' | 'refresh';
  jti?: string;
  exp?: number;
}

const DEFAULT_TEST_USER: TestUser = {
  sub: randomUUID(),
  tid: randomUUID(),
  role: 'admin',
  type: 'access',
  jti: randomUUID(),
};

const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';

// ---------------------------------------------------------------------------
// createTestApp — builds a minimal Fastify instance suitable for testing
// ---------------------------------------------------------------------------

export interface CreateTestAppOptions {
  /** Register additional routes/plugins before the app is ready */
  routes?: (app: FastifyInstance) => Promise<void>;
  /** Override the default mock database (defaults to empty object) */
  db?: unknown;
  /** Override config values */
  config?: Record<string, unknown>;
}

export async function createTestApp(opts: CreateTestAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Decorate with a mock db so route handlers that reference `fastify.db` don't crash
  app.decorate('db', opts.db ?? {});

  // Decorate with config
  app.decorate('config', {
    JWT_SECRET: TEST_JWT_SECRET,
    JWT_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    PORT: 0,
    HOST: '127.0.0.1',
    DATABASE_URL: '',
    REDIS_URL: '',
    ...opts.config,
  });

  // JWT plugin (real @fastify/jwt — so tokens actually work)
  await app.register(fjwt, {
    secret: TEST_JWT_SECRET,
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  // authenticate decorator — mirrors production jwt.ts
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (request.user.type !== 'access') {
        return reply.code(401).send({ error: 'Invalid token type' });
      }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // tenantId decorator
  app.decorateRequest('tenantId', '');
  app.addHook('preHandler', async (request: FastifyRequest) => {
    if ((request.routeOptions?.config as any)?.public) return;
    const user = request.user as { tid?: string } | undefined;
    if (user?.tid) {
      request.tenantId = user.tid;
    }
  });

  // Global auth hook — same logic as production server.ts
  app.addHook('onRequest', async (request, reply) => {
    if ((request.routeOptions?.config as any)?.public) return;
    if (request.url === '/health') return;
    await app.authenticate(request, reply);
  });

  // Error handler matching production
  app.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors });
      return;
    }
    if (error.validation) {
      reply.code(400).send({ error: 'VALIDATION_ERROR', message: error.message });
      return;
    }
    reply.code(500).send({ error: 'INTERNAL_ERROR', message: error.message });
  });

  // Register caller-supplied routes
  if (opts.routes) {
    await opts.routes(app);
  }

  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** Sign a JWT access token for use in test requests. */
export function signTestToken(
  app: FastifyInstance,
  overrides: Partial<TestUser> = {},
): string {
  const payload = { ...DEFAULT_TEST_USER, ...overrides, jti: overrides.jti ?? randomUUID() };
  return app.jwt.sign(payload, { expiresIn: '15m' });
}

/** Sign a refresh token. */
export function signTestRefreshToken(
  app: FastifyInstance,
  overrides: Partial<TestUser> = {},
): string {
  const payload = {
    ...DEFAULT_TEST_USER,
    ...overrides,
    type: 'refresh' as const,
    jti: overrides.jti ?? randomUUID(),
  };
  return app.jwt.sign(payload, { expiresIn: '7d' });
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

export interface InjectOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  payload?: unknown;
  headers?: Record<string, string>;
}

/** Make an authenticated request to the test app. */
export async function authRequest(
  app: FastifyInstance,
  opts: InjectOptions,
  tokenOverrides?: Partial<TestUser>,
) {
  const token = signTestToken(app, tokenOverrides);
  return app.inject({
    method: opts.method,
    url: opts.url,
    payload: opts.payload,
    headers: {
      authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });
}

/** Make an unauthenticated request. */
export async function anonRequest(app: FastifyInstance, opts: InjectOptions) {
  return app.inject({
    method: opts.method,
    url: opts.url,
    payload: opts.payload,
    headers: opts.headers,
  });
}
