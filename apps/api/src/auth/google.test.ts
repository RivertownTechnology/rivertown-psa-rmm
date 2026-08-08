import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { createTestApp, anonRequest } from '../test/helpers.js';
import { googleAuthRoutes } from './google.js';

const TEST_USER_ID = randomUUID();
const TEST_TENANT_ID = randomUUID();
const MOBILE_REDIRECT = 'rivertown://auth-callback';

function createMockDb(overrides: Record<string, unknown> = {}) {
  const mockUser = {
    id: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    email: 'mobile-user@test.com',
    displayName: 'Mobile User',
    role: 'tech',
    isActive: true,
    mfaEnabled: false,
    ...overrides,
  };

  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(overrides.noUser ? [] : [mockUser]),
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'https://api.test.com/api/v1/auth/google/callback';
  process.env.FRONTEND_URL = 'https://psa.test.com';

  app = await createTestApp({
    db: createMockDb(),
    routes: async (fastify) => {
      await fastify.register(googleAuthRoutes);
    },
  });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function locationOf(res: { headers: Record<string, unknown> }): URL {
  return new URL(String(res.headers.location));
}

// ---------------------------------------------------------------------------
// GET /api/v1/auth/google/mobile/start
// ---------------------------------------------------------------------------

describe('GET /api/v1/auth/google/mobile/start', () => {
  it('rejects a redirect_uri outside the rivertown:// allowlist', async () => {
    const res = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/google/mobile/start?redirect_uri=${encodeURIComponent('https://evil.example.com/steal')}&state=abc123`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_redirect_uri');
  });

  it('rejects a request missing redirect_uri', async () => {
    const res = await anonRequest(app, {
      method: 'GET',
      url: '/api/v1/auth/google/mobile/start?state=abc123',
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects a request missing state', async () => {
    const res = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/google/mobile/start?redirect_uri=${encodeURIComponent(MOBILE_REDIRECT)}`,
    });

    expect(res.statusCode).toBe(400);
  });

  it('redirects to Google with a generated CSRF state when redirect_uri is allowlisted', async () => {
    const res = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/google/mobile/start?redirect_uri=${encodeURIComponent(MOBILE_REDIRECT)}&state=client-opaque-state`,
    });

    expect(res.statusCode).toBe(302);
    const location = locationOf(res);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location.searchParams.get('client_id')).toBe('test-client-id');
    expect(location.searchParams.get('state')).toBeTruthy();
    // The internal state should not leak the caller's opaque state directly.
    expect(location.searchParams.get('state')).not.toBe('client-opaque-state');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/auth/google/callback (mobile branch)
// ---------------------------------------------------------------------------

describe('GET /api/v1/auth/google/callback — mobile flow', () => {
  async function startMobileFlow() {
    const startRes = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/google/mobile/start?redirect_uri=${encodeURIComponent(MOBILE_REDIRECT)}&state=client-opaque-state`,
    });
    const state = locationOf(startRes).searchParams.get('state')!;
    return state;
  }

  it('redirects to the rivertown:// deep link with tokens on success', async () => {
    const state = await startMobileFlow();

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'google-access-token' }), { status: 200 });
      }
      if (String(url).includes('googleapis.com/oauth2/v2/userinfo')) {
        return new Response(JSON.stringify({ id: '1', email: 'mobile-user@test.com', name: 'Mobile User', picture: '' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    const res = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/google/callback?code=fake-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);
    const location = locationOf(res);
    expect(`${location.protocol}//${location.host}`).toBe('rivertown://auth-callback');
    expect(location.searchParams.get('accessToken')).toBeTruthy();
    expect(location.searchParams.get('refreshToken')).toBeTruthy();
  });

  it('redirects to the deep link with an error when no matching account exists', async () => {
    const noAccountApp = await createTestApp({
      db: createMockDb({ noUser: true }),
      routes: async (fastify) => {
        await fastify.register(googleAuthRoutes);
      },
    });

    const startRes = await anonRequest(noAccountApp, {
      method: 'GET',
      url: `/api/v1/auth/google/mobile/start?redirect_uri=${encodeURIComponent(MOBILE_REDIRECT)}&state=client-opaque-state`,
    });
    const state = locationOf(startRes).searchParams.get('state')!;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'google-access-token' }), { status: 200 });
      }
      if (String(url).includes('googleapis.com/oauth2/v2/userinfo')) {
        return new Response(JSON.stringify({ id: '1', email: 'nobody@test.com', name: 'Nobody', picture: '' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    const res = await anonRequest(noAccountApp, {
      method: 'GET',
      url: `/api/v1/auth/google/callback?code=fake-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);
    const location = locationOf(res);
    expect(`${location.protocol}//${location.host}`).toBe('rivertown://auth-callback');
    expect(location.searchParams.get('error')).toBe('no_account');

    await noAccountApp.close();
  });

  it('falls back to the web login error page for an invalid/unknown state', async () => {
    const res = await anonRequest(app, {
      method: 'GET',
      url: '/api/v1/auth/google/callback?code=fake-code&state=not-a-real-state',
    });

    expect(res.statusCode).toBe(302);
    const location = locationOf(res);
    expect(location.toString()).toBe('https://psa.test.com/login?error=invalid_state');
  });

  it('rejects reusing the same state twice', async () => {
    const state = await startMobileFlow();

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'google-access-token' }), { status: 200 });
      }
      if (String(url).includes('googleapis.com/oauth2/v2/userinfo')) {
        return new Response(JSON.stringify({ id: '1', email: 'mobile-user@test.com', name: 'Mobile User', picture: '' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    const first = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/google/callback?code=fake-code&state=${state}`,
    });
    expect(first.statusCode).toBe(302);
    expect(`${locationOf(first).protocol}//${locationOf(first).host}`).toBe('rivertown://auth-callback');

    const second = await anonRequest(app, {
      method: 'GET',
      url: `/api/v1/auth/google/callback?code=fake-code&state=${state}`,
    });
    expect(second.statusCode).toBe(302);
    // Second use has no stored state entry left, so it falls back to the web error page.
    expect(locationOf(second).toString()).toBe('https://psa.test.com/login?error=invalid_state');
  });
});
