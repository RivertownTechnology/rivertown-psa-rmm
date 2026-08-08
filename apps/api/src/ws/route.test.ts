import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fjwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { randomUUID } from 'crypto';
import { wsRoutes } from './route.js';
import { broadcastToTenant } from './broadcast.js';

const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
const TEST_USER_ID = randomUUID();
const TEST_TENANT_ID = randomUUID();

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(fjwt, {
    secret: TEST_JWT_SECRET,
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });
  await app.register(websocket);
  await app.register(wsRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function signAccessToken(overrides: Record<string, unknown> = {}): string {
  return app.jwt.sign(
    { jti: randomUUID(), sub: TEST_USER_ID, tid: TEST_TENANT_ID, role: 'tech', type: 'access', ...overrides },
    { expiresIn: '15m' },
  );
}

function waitForClose(ws: { on: (event: string, cb: (...args: any[]) => void) => void }): Promise<{ code: number }> {
  return new Promise((resolve) => {
    ws.on('close', (code: number) => resolve({ code }));
  });
}

describe('GET /api/v1/ws — auth rejection', () => {
  it('closes the socket with 4401 when no token is provided', async () => {
    const ws = await app.injectWS('/api/v1/ws');
    const { code } = await waitForClose(ws);
    expect(code).toBe(4401);
  });

  it('closes the socket with 4401 when the token is garbage', async () => {
    const ws = await app.injectWS('/api/v1/ws?token=not-a-real-jwt');
    const { code } = await waitForClose(ws);
    expect(code).toBe(4401);
  });

  it('closes the socket with 4401 when given a refresh token instead of an access token', async () => {
    const refreshToken = app.jwt.sign(
      { jti: randomUUID(), sub: TEST_USER_ID, tid: TEST_TENANT_ID, role: 'tech', type: 'refresh' },
      { expiresIn: '7d' },
    );
    const ws = await app.injectWS(`/api/v1/ws?token=${refreshToken}`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4401);
  });

  it('closes the socket with 4401 when the token is signed with the wrong secret', async () => {
    const foreignApp = Fastify({ logger: false });
    await foreignApp.register(fjwt, { secret: 'a-completely-different-secret-32-chars!!' });
    await foreignApp.ready();
    const forgedToken = foreignApp.jwt.sign({ jti: randomUUID(), sub: TEST_USER_ID, tid: TEST_TENANT_ID, role: 'tech', type: 'access' });
    await foreignApp.close();

    const ws = await app.injectWS(`/api/v1/ws?token=${forgedToken}`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4401);
  });

  it('accepts a valid access token via ?token= and keeps the connection open', async () => {
    const token = signAccessToken();
    const ws = await app.injectWS(`/api/v1/ws?token=${token}`);

    // No close within a short window == accepted (matches the header-token case below).
    let closed = false;
    ws.on('close', () => { closed = true; });
    await new Promise((r) => setTimeout(r, 50));
    expect(closed).toBe(false);

    ws.close();
  });

  it('accepts a valid access token via the Authorization header', async () => {
    const token = signAccessToken();
    const ws = await app.injectWS('/api/v1/ws', { headers: { authorization: `Bearer ${token}` } });

    let closed = false;
    ws.on('close', () => { closed = true; });
    await new Promise((r) => setTimeout(r, 50));
    expect(closed).toBe(false);

    ws.close();
  });
});

describe('broadcastToTenant', () => {
  it('delivers a { type, ticketId } frame only to sockets of the same tenant', async () => {
    const tokenA = signAccessToken({ tid: TEST_TENANT_ID });
    const otherTenantId = randomUUID();
    const tokenB = signAccessToken({ tid: otherTenantId });

    const wsA = await app.injectWS(`/api/v1/ws?token=${tokenA}`);
    const wsB = await app.injectWS(`/api/v1/ws?token=${tokenB}`);

    const messageA = new Promise<string>((resolve) => wsA.once('message', (data: Buffer) => resolve(data.toString())));
    let messageBReceived = false;
    wsB.on('message', () => { messageBReceived = true; });

    broadcastToTenant(TEST_TENANT_ID, { type: 'ticket.updated', ticketId: 'ticket-123' });

    const raw = await messageA;
    expect(JSON.parse(raw)).toEqual({ type: 'ticket.updated', ticketId: 'ticket-123' });

    await new Promise((r) => setTimeout(r, 50));
    expect(messageBReceived).toBe(false);

    wsA.close();
    wsB.close();
  });
});
