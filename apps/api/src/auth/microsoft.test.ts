import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { createTestApp, anonRequest } from '../test/helpers.js';

// Mock the Entra helper so tests never hit the network (token endpoint / JWKS).
// getMicrosoftConfig + buildAuthorizeUrl stay real (env-driven, pure); only the
// two network calls are stubbed.
vi.mock('./microsoft-oauth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./microsoft-oauth.js')>();
  return {
    ...actual,
    exchangeCodeForTokens: vi.fn(),
    validateIdToken: vi.fn(),
  };
});

import { microsoftAuthRoutes } from './microsoft.js';
import { exchangeCodeForTokens, validateIdToken } from './microsoft-oauth.js';

const exchangeMock = exchangeCodeForTokens as unknown as Mock;
const validateMock = validateIdToken as unknown as Mock;

const TEST_USER_ID = randomUUID();
const TEST_TENANT_ID = randomUUID();
const MS_TENANT = 'entra-tenant-guid';
const USER_OID = 'oid-abc-123';

function createMockDb(overrides: Record<string, unknown> = {}) {
  const mockUser = {
    id: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    email: 'ms-user@test.com',
    displayName: 'MS User',
    role: 'tech',
    isActive: true,
    mfaEnabled: false,
    ssoProvider: null,
    ssoSubjectId: null,
    ssoTenantId: null,
    ...overrides,
  };

  const updated: Record<string, unknown>[] = [];

  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(overrides.noUser ? [] : [mockUser]),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          updated.push(vals);
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
    // test-only introspection
    _updated: updated,
  };
  return db;
}

let app: FastifyInstance;
let mockDb: ReturnType<typeof createMockDb>;

beforeAll(async () => {
  process.env.MS_CLIENT_ID = 'test-ms-client-id';
  process.env.MS_CLIENT_SECRET = 'test-ms-client-secret';
  process.env.MS_TENANT_ID = MS_TENANT;
  process.env.MS_REDIRECT_URI = 'https://api.test.com/api/v1/auth/microsoft/callback';
  process.env.FRONTEND_URL = 'https://psa.test.com';

  mockDb = createMockDb();
  app = await createTestApp({
    db: mockDb,
    routes: async (fastify) => {
      await fastify.register(microsoftAuthRoutes);
    },
  });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults: a valid token exchange + a matching identity.
  exchangeMock.mockResolvedValue({ id_token: 'fake-id-token', access_token: 'fake-access' });
  validateMock.mockResolvedValue({
    oid: USER_OID,
    tid: MS_TENANT,
    email: 'ms-user@test.com',
    name: 'MS User',
    preferredUsername: 'ms-user@test.com',
  });
});

function locationOf(res: { headers: Record<string, unknown> }): URL {
  // microsoft:// scheme etc. not expected here — all redirects are https/frontend
  return new URL(String(res.headers.location));
}

// ---------------------------------------------------------------------------
// GET /api/v1/auth/microsoft
// ---------------------------------------------------------------------------

describe('GET /api/v1/auth/microsoft', () => {
  it('redirects to Entra with a generated CSRF state', async () => {
    const res = await anonRequest(app, { method: 'GET', url: '/api/v1/auth/microsoft' });

    expect(res.statusCode).toBe(302);
    const location = locationOf(res);
    expect(location.origin + location.pathname).toBe(
      `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize`,
    );
    expect(location.searchParams.get('client_id')).toBe('test-ms-client-id');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('scope')).toBe('openid email profile User.Read');
    expect(location.searchParams.get('state')).toBeTruthy();
  });

  it('returns 503 when Microsoft SSO is not configured', async () => {
    const prev = process.env.MS_CLIENT_ID;
    delete process.env.MS_CLIENT_ID;
    try {
      const res = await anonRequest(app, { method: 'GET', url: '/api/v1/auth/microsoft' });
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toBe('Microsoft SSO is not configured');
    } finally {
      process.env.MS_CLIENT_ID = prev;
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/auth/microsoft/callback
// ---------------------------------------------------------------------------

describe('GET /api/v1/auth/microsoft/callback', () => {
  async function startFlow(targetApp: FastifyInstance = app): Promise<string> {
    const startRes = await anonRequest(targetApp, { method: 'GET', url: '/api/v1/auth/microsoft' });
    return locationOf(startRes).searchParams.get('state')!;
  }

  it('matches a user by email, records the MS identity, and redirects with an exchange code', async () => {
    const state = await startFlow();

    const res = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/microsoft/callback?code=fake-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);
    const location = locationOf(res);
    expect(location.origin + location.pathname).toBe('https://psa.test.com/auth/callback');
    expect(location.searchParams.get('code')).toBeTruthy();

    // Recorded the Microsoft identity on the user row.
    expect(mockDb._updated.length).toBeGreaterThan(0);
    const setVals = mockDb._updated[mockDb._updated.length - 1];
    expect(setVals.ssoProvider).toBe('microsoft');
    expect(setVals.ssoSubjectId).toBe(USER_OID);
    expect(setVals.ssoTenantId).toBe(MS_TENANT);
  });

  it('redirects with error=no_account when no user matches the email', async () => {
    const noAccountApp = await createTestApp({
      db: createMockDb({ noUser: true }),
      routes: async (fastify) => {
        await fastify.register(microsoftAuthRoutes);
      },
    });

    const state = await startFlow(noAccountApp);
    const res = await anonRequest(noAccountApp, {
      method: 'GET',
      url: `/api/v1/auth/microsoft/callback?code=fake-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);
    expect(locationOf(res).toString()).toBe('https://psa.test.com/login?error=no_account');

    await noAccountApp.close();
  });

  it('rejects when the incoming oid differs from the user\'s recorded ssoSubjectId', async () => {
    const boundApp = await createTestApp({
      db: createMockDb({ ssoSubjectId: 'previously-bound-oid' }),
      routes: async (fastify) => {
        await fastify.register(microsoftAuthRoutes);
      },
    });

    // Incoming token carries a different oid than the one already on the row.
    validateMock.mockResolvedValue({
      oid: 'a-different-oid',
      tid: MS_TENANT,
      email: 'ms-user@test.com',
      name: 'MS User',
      preferredUsername: 'ms-user@test.com',
    });

    const state = await startFlow(boundApp);
    const res = await anonRequest(boundApp, {
      method: 'GET',
      url: `/api/v1/auth/microsoft/callback?code=fake-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);
    expect(locationOf(res).toString()).toBe('https://psa.test.com/login?error=identity_mismatch');

    await boundApp.close();
  });

  it('rejects when the token tenant (tid) does not match MS_TENANT_ID', async () => {
    const state = await startFlow();
    validateMock.mockResolvedValue({
      oid: USER_OID,
      tid: 'some-other-tenant',
      email: 'ms-user@test.com',
      name: 'MS User',
      preferredUsername: 'ms-user@test.com',
    });

    const res = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/microsoft/callback?code=fake-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);
    expect(locationOf(res).toString()).toBe('https://psa.test.com/login?error=tenant_mismatch');
  });

  it('falls back to the web login error page for an invalid/unknown state', async () => {
    const res = await anonRequest(app, {
      method: 'GET',
      url: '/api/v1/auth/microsoft/callback?code=fake-code&state=not-a-real-state',
    });

    expect(res.statusCode).toBe(302);
    expect(locationOf(res).toString()).toBe('https://psa.test.com/login?error=invalid_state');
  });

  it('rejects reusing the same state twice', async () => {
    const state = await startFlow();

    const first = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/microsoft/callback?code=fake-code&state=${state}`,
    });
    expect(first.statusCode).toBe(302);
    expect(locationOf(first).origin + locationOf(first).pathname).toBe('https://psa.test.com/auth/callback');

    const second = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/microsoft/callback?code=fake-code&state=${state}`,
    });
    expect(second.statusCode).toBe(302);
    expect(locationOf(second).toString()).toBe('https://psa.test.com/login?error=invalid_state');
  });
});
