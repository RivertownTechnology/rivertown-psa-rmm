import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { createTestApp, anonRequest } from '../../test/helpers.js';

// Stub only the two network calls in the Entra helper. getPortalMicrosoftConfig +
// buildAuthorizeUrl stay real (env-driven, pure).
vi.mock('../../auth/microsoft-oauth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/microsoft-oauth.js')>();
  return {
    ...actual,
    exchangeCodeForTokens: vi.fn(),
    validateMultiTenantIdToken: vi.fn(),
  };
});

import { portalRoutes } from './routes.js';
import { exchangeCodeForTokens, validateMultiTenantIdToken } from '../../auth/microsoft-oauth.js';

const exchangeMock = exchangeCodeForTokens as unknown as Mock;
const validateMock = validateMultiTenantIdToken as unknown as Mock;

const PORTAL_URL = 'https://portal.test.com';
const CUSTOMER_TENANT = 'customer-entra-tenant-guid';

function createMockDb(contact: Record<string, unknown> | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(contact ? [contact] : []),
        }),
      }),
    }),
  };
}

const CONTACT = {
  id: randomUUID(),
  tenantId: randomUUID(),
  customerId: randomUUID(),
  email: 'customer@acme.com',
  firstName: 'Casey',
  lastName: 'Customer',
  portalEnabled: true,
  portalRole: 'user',
  portalPermissions: ['tickets'],
};

async function buildApp(contact: Record<string, unknown> | null) {
  return createTestApp({
    db: createMockDb(contact),
    routes: async (fastify) => { await fastify.register(portalRoutes); },
  });
}

function locationOf(res: { headers: Record<string, unknown> }): URL {
  return new URL(String(res.headers.location));
}

beforeAll(() => {
  process.env.MS_PORTAL_CLIENT_ID = 'test-portal-client-id';
  process.env.MS_PORTAL_CLIENT_SECRET = 'test-portal-secret';
  process.env.MS_PORTAL_REDIRECT_URI = 'https://api.test.com/api/v1/portal/auth/microsoft/callback';
  process.env.PORTAL_URL = PORTAL_URL;
});

afterAll(() => {
  delete process.env.MS_PORTAL_CLIENT_ID;
  delete process.env.MS_PORTAL_CLIENT_SECRET;
  delete process.env.MS_PORTAL_REDIRECT_URI;
  delete process.env.PORTAL_URL;
});

beforeEach(() => {
  vi.clearAllMocks();
  exchangeMock.mockResolvedValue({ id_token: 'fake-id-token', access_token: 'fake-access' });
  validateMock.mockResolvedValue({
    oid: 'oid-portal-1',
    tid: CUSTOMER_TENANT,
    email: 'customer@acme.com',
    name: 'Casey Customer',
    preferredUsername: 'customer@acme.com',
  });
});

describe('GET /api/v1/portal/auth/microsoft', () => {
  it('redirects to the multi-tenant (/organizations) consent URL with CSRF state', async () => {
    const app = await buildApp(CONTACT);
    const res = await anonRequest(app, { method: 'GET', url: '/api/v1/portal/auth/microsoft' });

    expect(res.statusCode).toBe(302);
    const location = locationOf(res);
    expect(location.origin + location.pathname).toBe(
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    );
    expect(location.searchParams.get('client_id')).toBe('test-portal-client-id');
    expect(location.searchParams.get('scope')).toBe('openid email profile User.Read');
    expect(location.searchParams.get('state')).toBeTruthy();
    await app.close();
  });

  it('returns 503 when MS_PORTAL_* is not configured', async () => {
    const prev = process.env.MS_PORTAL_CLIENT_ID;
    delete process.env.MS_PORTAL_CLIENT_ID;
    try {
      const app = await buildApp(CONTACT);
      const res = await anonRequest(app, { method: 'GET', url: '/api/v1/portal/auth/microsoft' });
      expect(res.statusCode).toBe(503);
      await app.close();
    } finally {
      process.env.MS_PORTAL_CLIENT_ID = prev;
    }
  });
});

describe('GET /api/v1/portal/auth/microsoft/callback', () => {
  async function startFlow(app: FastifyInstance): Promise<string> {
    const startRes = await anonRequest(app, { method: 'GET', url: '/api/v1/portal/auth/microsoft' });
    return locationOf(startRes).searchParams.get('state')!;
  }

  it('matches a portal-enabled contact and redirects with a one-time exchange code', async () => {
    const app = await buildApp(CONTACT);
    const state = await startFlow(app);

    const res = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/portal/auth/microsoft/callback?code=fake-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);
    const location = locationOf(res);
    expect(location.origin + location.pathname).toBe(`${PORTAL_URL}/auth/callback`);
    const exchangeCode = location.searchParams.get('code');
    expect(exchangeCode).toBeTruthy();

    // The exchange swaps the code for real portal tokens (password-login shape).
    const exchangeRes = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/portal/auth/microsoft/exchange',
      payload: { code: exchangeCode },
    });
    expect(exchangeRes.statusCode).toBe(200);
    const body = exchangeRes.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.customerId).toBe(CONTACT.customerId);
    expect(body.portalRole).toBe('user');
    expect(body.portalPermissions).toEqual(['tickets']);
    expect(body.user.email).toBe('customer@acme.com');

    // The access token carries portal_user claims.
    const decoded = app.jwt.verify(body.accessToken) as Record<string, unknown>;
    expect(decoded.role).toBe('portal_user');
    expect(decoded.cid).toBe(CONTACT.customerId);

    // One-time: a second exchange for the same code fails.
    const reuse = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/portal/auth/microsoft/exchange',
      payload: { code: exchangeCode },
    });
    expect(reuse.statusCode).toBe(401);
    await app.close();
  });

  it('redirects with error=no_portal_access when no contact matches the email', async () => {
    const app = await buildApp(null);
    const state = await startFlow(app);
    const res = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/portal/auth/microsoft/callback?code=fake-code&state=${state}`,
    });
    expect(res.statusCode).toBe(302);
    expect(locationOf(res).toString()).toBe(`${PORTAL_URL}/login?error=no_portal_access`);
    await app.close();
  });

  it('redirects with error=no_portal_access when the contact is not portal-enabled', async () => {
    const app = await buildApp({ ...CONTACT, portalEnabled: false });
    const state = await startFlow(app);
    const res = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/portal/auth/microsoft/callback?code=fake-code&state=${state}`,
    });
    expect(res.statusCode).toBe(302);
    expect(locationOf(res).toString()).toBe(`${PORTAL_URL}/login?error=no_portal_access`);
    await app.close();
  });

  it('rejects an unknown/invalid CSRF state', async () => {
    const app = await buildApp(CONTACT);
    const res = await anonRequest(app, {
      method: 'GET',
      url: '/api/v1/portal/auth/microsoft/callback?code=fake-code&state=not-a-real-state',
    });
    expect(res.statusCode).toBe(302);
    expect(locationOf(res).toString()).toBe(`${PORTAL_URL}/login?error=invalid_state`);
    await app.close();
  });
});
