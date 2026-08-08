import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { createTestApp, authRequest, anonRequest } from '../../test/helpers.js';
import { notificationRoutes } from './routes.js';

const TEST_USER_ID = randomUUID();
const TEST_TENANT_ID = randomUUID();

/**
 * Mock db supporting only the chains device-token routes use:
 *   insert(deviceTokens).values(...).onConflictDoUpdate(...).returning()
 *   delete(deviceTokens).where(...)
 */
function createMockDb() {
  const upserts: Array<{ values: any; conflict: any }> = [];
  const deletes: unknown[] = [];

  const db = {
    insert: (_table: unknown) => ({
      values: (vals: any) => ({
        onConflictDoUpdate: (opts: unknown) => {
          upserts.push({ values: vals, conflict: opts });
          return {
            returning: () => Promise.resolve([{ id: randomUUID(), token: vals.token }]),
          };
        },
      }),
    }),
    delete: (_table: unknown) => ({
      where: (cond: unknown) => {
        deletes.push(cond);
        return Promise.resolve();
      },
    }),
  };

  return { db, upserts, deletes };
}

let app: FastifyInstance;
let mock: ReturnType<typeof createMockDb>;

beforeAll(async () => {
  mock = createMockDb();
  app = await createTestApp({
    db: mock.db,
    routes: async (fastify) => {
      await fastify.register(notificationRoutes);
    },
  });
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// POST /api/v1/notifications/devices
// ---------------------------------------------------------------------------

describe('POST /api/v1/notifications/devices', () => {
  it('upserts a device token for the authenticated user and returns 200', async () => {
    const res = await authRequest(
      app,
      {
        method: 'POST',
        url: '/api/v1/notifications/devices',
        payload: {
          token: 'apns-device-token-abc123',
          platform: 'ios',
          bundleId: 'com.rivertown.app',
          environment: 'production',
        },
      },
      { sub: TEST_USER_ID, tid: TEST_TENANT_ID },
    );

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ token: 'apns-device-token-abc123' });
    expect(mock.upserts).toHaveLength(1);
    const [{ values, conflict }] = mock.upserts;
    expect(values).toMatchObject({
      tenantId: TEST_TENANT_ID,
      userId: TEST_USER_ID,
      token: 'apns-device-token-abc123',
      platform: 'ios',
      bundleId: 'com.rivertown.app',
      environment: 'production',
    });
    expect(conflict.set).toMatchObject({
      tenantId: TEST_TENANT_ID,
      userId: TEST_USER_ID,
    });
  });

  it('reassigns a token to the current user when it moved devices/accounts', async () => {
    const otherUserId = randomUUID();

    const res = await authRequest(
      app,
      {
        method: 'POST',
        url: '/api/v1/notifications/devices',
        payload: {
          token: 'apns-device-token-shared',
          platform: 'ios',
          bundleId: 'com.rivertown.app',
          environment: 'sandbox',
        },
      },
      { sub: otherUserId, tid: TEST_TENANT_ID },
    );

    expect(res.statusCode).toBe(200);
    const last = mock.upserts[mock.upserts.length - 1];
    expect(last.conflict.set.userId).toBe(otherUserId);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await authRequest(
      app,
      {
        method: 'POST',
        url: '/api/v1/notifications/devices',
        payload: { token: 'only-a-token' },
      },
      { sub: TEST_USER_ID, tid: TEST_TENANT_ID },
    );

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without authentication', async () => {
    const res = await anonRequest(app, {
      method: 'POST',
      url: '/api/v1/notifications/devices',
      payload: {
        token: 'apns-device-token-abc123',
        platform: 'ios',
        bundleId: 'com.rivertown.app',
        environment: 'production',
      },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/notifications/devices/:token
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/notifications/devices/:token', () => {
  it('deletes the token and returns 204', async () => {
    const res = await authRequest(
      app,
      { method: 'DELETE', url: '/api/v1/notifications/devices/apns-device-token-abc123' },
      { sub: TEST_USER_ID, tid: TEST_TENANT_ID },
    );

    expect(res.statusCode).toBe(204);
    expect(mock.deletes).toHaveLength(1);
  });

  it('returns 401 without authentication', async () => {
    const res = await anonRequest(app, {
      method: 'DELETE',
      url: '/api/v1/notifications/devices/apns-device-token-abc123',
    });

    expect(res.statusCode).toBe(401);
  });
});
