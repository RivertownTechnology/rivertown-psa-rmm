import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import {
  createTestApp,
  signTestToken,
  signTestRefreshToken,
  authRequest,
  anonRequest,
} from '../../test/helpers.js';
import { authRoutes } from '../../auth/routes.js';

// ---------------------------------------------------------------------------
// Shared test app
// ---------------------------------------------------------------------------

let app: FastifyInstance;

const TEST_USER_ID = randomUUID();
const TEST_TENANT_ID = randomUUID();

/**
 * Builds a minimal mock db that satisfies the queries auth routes make.
 * Only the `.select().from(users).where(...).limit(1)` chain is needed.
 */
function createMockDb(overrides: Record<string, unknown> = {}) {
  const mockUser = {
    id: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    email: 'admin@test.com',
    displayName: 'Test Admin',
    role: 'admin',
    isActive: true,
    mfaEnabled: false,
    mfaProvider: null,
    ...overrides,
  };

  // Chainable query builder mock
  function makeSelect() {
    return {
      select: (cols?: unknown) => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([mockUser]),
          }),
        }),
      }),
    };
  }

  return makeSelect();
}

beforeAll(async () => {
  app = await createTestApp({
    db: createMockDb(),
    routes: async (fastify) => {
      await fastify.register(authRoutes);
    },
  });
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/login', () => {
  it('returns 401 because password login is disabled (Google SSO only)', async () => {
    const res = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@test.com', password: 'ValidPass123!' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error).toBe('UNAUTHORIZED');
    expect(body.message).toMatch(/Google SSO/i);
  });

  it('returns 401 even with missing credentials', async () => {
    const res = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {},
    });

    // Should still 401 — the route unconditionally throws
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/refresh
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/refresh', () => {
  it('issues new tokens when given a valid refresh token', async () => {
    const refreshToken = signTestRefreshToken(app, {
      sub: TEST_USER_ID,
      tid: TEST_TENANT_ID,
      role: 'admin',
    });

    const res = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    // New tokens should be different from the original
    expect(body.refreshToken).not.toBe(refreshToken);
  });

  it('returns 401 when refreshToken is missing', async () => {
    const res = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: {},
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when given an access token instead of a refresh token', async () => {
    const accessToken = signTestToken(app, {
      sub: TEST_USER_ID,
      tid: TEST_TENANT_ID,
    });

    const res = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: accessToken },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when given a garbage token', async () => {
    const res = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'not-a-real-jwt' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when user is inactive', async () => {
    // Build an app with an inactive user mock
    const inactiveApp = await createTestApp({
      db: createMockDb({ isActive: false }),
      routes: async (fastify) => {
        await fastify.register(authRoutes);
      },
    });

    const refreshToken = signTestRefreshToken(inactiveApp, {
      sub: TEST_USER_ID,
      tid: TEST_TENANT_ID,
      role: 'admin',
    });

    const res = await anonRequest(inactiveApp, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(401);
    await inactiveApp.close();
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/auth/me
// ---------------------------------------------------------------------------

describe('GET /api/v1/auth/me', () => {
  it('returns user profile when authenticated', async () => {
    const res = await authRequest(
      app,
      { method: 'GET', url: '/api/v1/auth/me' },
      { sub: TEST_USER_ID, tid: TEST_TENANT_ID, role: 'admin' },
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('role');
    expect(body).toHaveProperty('tenantId');
  });

  it('returns 401 without a token', async () => {
    const res = await anonRequest(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer garbage-token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when using a refresh token on a protected route', async () => {
    const refreshToken = signTestRefreshToken(app, {
      sub: TEST_USER_ID,
      tid: TEST_TENANT_ID,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${refreshToken}` },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/logout
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/logout', () => {
  it('returns success when authenticated', async () => {
    const res = await authRequest(
      app,
      { method: 'POST', url: '/api/v1/auth/logout' },
      { sub: TEST_USER_ID, tid: TEST_TENANT_ID },
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ success: true });
  });

  it('returns 401 without authentication', async () => {
    const res = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/auth/logout',
    });

    expect(res.statusCode).toBe(401);
  });
});
