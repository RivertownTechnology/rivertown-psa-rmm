/**
 * Shared OAuth SSO state + exchange-code plumbing.
 *
 * The in-memory CSRF `state` map and the one-time exchange-code map are shared
 * across every staff SSO provider (Google, Microsoft, …) so a code minted by
 * one provider's callback can be redeemed by the single, provider-neutral
 * exchange endpoint. Extracted here (rather than duplicated per provider) so the
 * maps and TTL-cleanup logic never diverge.
 */

import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Shared in-memory stores (with TTLs)
// ---------------------------------------------------------------------------

export interface OAuthStateEntry {
  expiresAt: number;
  // Present when this state originated from the mobile-app flow — tells the
  // callback where to deliver tokens instead of the web exchange-code flow.
  mobile?: { redirectUri: string; clientState: string };
}

export interface ExchangeCodeEntry {
  userId: string;
  tenantId: string;
  role: string;
  displayName: string;
  email: string;
  mfaEnabled: boolean;
  expiresAt: number;
}

export const oauthStates = new Map<string, OAuthStateEntry>();
export const exchangeCodes = new Map<string, ExchangeCodeEntry>();

export function cleanExpired<T extends { expiresAt: number }>(map: Map<string, T>) {
  const now = Date.now();
  for (const [key, val] of map) {
    if (val.expiresAt < now) map.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Provider-neutral exchange endpoint
// ---------------------------------------------------------------------------

/**
 * Registers the one-time-code → JWT exchange endpoint. Any staff SSO provider
 * callback writes an entry into {@link exchangeCodes} and redirects the browser
 * to the frontend with only that code; the frontend POSTs it here to receive
 * real JWTs (tokens are never placed in a redirect URL).
 *
 * Registers the provider-neutral `/api/v1/auth/exchange` plus the legacy
 * `/api/v1/auth/google/exchange` alias (same handler) so the existing Google
 * flow and frontend keep working unchanged.
 *
 * Registered exactly once (from `googleAuthRoutes`) to avoid duplicate-route
 * errors — the endpoint is provider-agnostic, so a single registration serves
 * Google, Microsoft, and any future provider.
 */
export function registerAuthExchangeRoutes(fastify: FastifyInstance) {
  const handler = async (request: { body: unknown }) => {
    const { code } = (request.body ?? {}) as { code?: string };
    if (!code) throw new Error('Exchange code required');

    const entry = exchangeCodes.get(code);
    exchangeCodes.delete(code);

    if (!entry || entry.expiresAt < Date.now()) {
      throw new Error('Invalid or expired exchange code');
    }

    const accessToken = fastify.jwt.sign(
      { jti: randomUUID(), sub: entry.userId, tid: entry.tenantId, role: entry.role, type: 'access' as const },
      { expiresIn: fastify.config.JWT_EXPIRES_IN || '15m' },
    );

    const refreshToken = fastify.jwt.sign(
      { jti: randomUUID(), sub: entry.userId, tid: entry.tenantId, role: entry.role, type: 'refresh' as const },
      { expiresIn: fastify.config.REFRESH_TOKEN_EXPIRES_IN || '7d' },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        displayName: entry.displayName,
        email: entry.email,
        role: entry.role,
        mfaEnabled: entry.mfaEnabled,
      },
    };
  };

  // Provider-neutral endpoint (preferred going forward)
  fastify.post('/api/v1/auth/exchange', { config: { public: true } as any }, handler);
  // Legacy alias — keeps the current Google web flow + frontend working
  fastify.post('/api/v1/auth/google/exchange', { config: { public: true } as any }, handler);
}
