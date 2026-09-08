import Fastify from 'fastify';
import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';
import { exchangeCodes, registerAuthExchangeRoutes } from './oauth-shared.js';

const verifier = 'a'.repeat(64);
const redirectUri = 'http://127.0.0.1:49200/callback/';
const entry = { userId: 'user', tenantId: 'tenant', role: 'tech', displayName: 'Test', email: 'test@example.com', mfaEnabled: false, expiresAt: Date.now() + 60000 };
async function server() {
  const app = Fastify();
  app.decorate('jwt', { sign: () => 'signed-test-token' } as any);
  app.decorate('config', {} as any);
  registerAuthExchangeRoutes(app);
  return app;
}
describe('desktop exchange route', () => {
  it('requires PKCE, supports a valid exchange, and prevents replay', async () => {
    const app = await server();
    try {
      const desktop = { redirectUri, challenge: createHash('sha256').update(verifier).digest('base64url') };
      exchangeCodes.set('missing-proof', { ...entry, desktop });
      const missing = await app.inject({ method: 'POST', url: '/api/v1/auth/exchange', payload: { code: 'missing-proof' } });
      expect(missing.statusCode).toBeGreaterThanOrEqual(400);
      expect(missing.json().accessToken).toBeUndefined();
      exchangeCodes.set('valid-proof', { ...entry, desktop });
      const request = { method: 'POST' as const, url: '/api/v1/auth/exchange', payload: { code: 'valid-proof', codeVerifier: verifier, redirectUri } };
      expect((await app.inject(request)).json().accessToken).toBe('signed-test-token');
      expect((await app.inject(request)).statusCode).toBeGreaterThanOrEqual(400);
    } finally { await app.close(); }
  });
  it('preserves the existing web exchange alias', async () => {
    const app = await server();
    try {
      exchangeCodes.set('web-code', entry);
      const result = await app.inject({ method: 'POST', url: '/api/v1/auth/google/exchange', payload: { code: 'web-code' } });
      expect(result.statusCode).toBe(200);
    } finally { await app.close(); }
  });
});
