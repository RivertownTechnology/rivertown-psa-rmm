/**
 * Google OAuth2 SSO - Sign in with Google for Rivertown PSA
 *
 * Flow:
 *   1. GET /api/v1/auth/google → redirect to Google consent (with CSRF state)
 *   2. Google redirects to /api/v1/auth/google/callback with code + state
 *   3. Validate state, exchange code for tokens, get user profile
 *   4. Match user by email → generate short-lived exchange code
 *   5. Redirect to frontend with code (NOT tokens)
 *   6. Frontend calls POST /api/v1/auth/google/exchange to get JWT tokens
 */

import { FastifyInstance } from 'fastify';
import { randomBytes, randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { users } from '@rivertown/db';
import { logAudit } from '../common/audit.js';
import { oauthStates, exchangeCodes, cleanExpired, registerAuthExchangeRoutes } from './oauth-shared.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Custom-scheme redirect URIs the mobile Google SSO flow is allowed to hand
// tokens back to. Prevents an attacker from supplying an arbitrary
// redirect_uri and phishing tokens via open redirect.
const MOBILE_REDIRECT_ALLOWLIST = ['rivertown://auth-callback'];

function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    frontendUrl: process.env.FRONTEND_URL || 'https://psa.rivertowntechnology.com',
  };
}

export async function googleAuthRoutes(fastify: FastifyInstance) {
  // Step 1: Redirect to Google with CSRF state
  fastify.get(
    '/api/v1/auth/google',
    { config: { public: true } as any },
    async (request, reply) => {
      const google = getGoogleConfig();

      if (!google.clientId || !google.redirectUri) {
        return reply.code(503).send({ error: 'Google SSO not configured' });
      }

      // Generate cryptographic state for CSRF protection
      const state = randomBytes(32).toString('hex');
      oauthStates.set(state, { expiresAt: Date.now() + 10 * 60 * 1000 });
      cleanExpired(oauthStates);

      const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: google.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
        state,
      });

      return reply.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    },
  );

  // Mobile entry point: iOS app opens this in a browser/ASWebAuthenticationSession.
  // Same Google consent flow as Step 1, but the callback delivers tokens via a
  // rivertown:// deep link instead of the web exchange-code flow.
  fastify.get(
    '/api/v1/auth/google/mobile/start',
    { config: { public: true } as any },
    async (request, reply) => {
      const google = getGoogleConfig();

      if (!google.clientId || !google.redirectUri) {
        return reply.code(503).send({ error: 'Google SSO not configured' });
      }

      const { redirect_uri: redirectUri, state: clientState } = request.query as {
        redirect_uri?: string;
        state?: string;
      };

      if (!redirectUri || !MOBILE_REDIRECT_ALLOWLIST.includes(redirectUri)) {
        return reply.code(400).send({ error: 'invalid_redirect_uri' });
      }
      if (!clientState) {
        return reply.code(400).send({ error: 'state is required' });
      }

      // Generate our own CSRF state for the Google round-trip; the caller's
      // opaque state is stashed alongside it and isn't sent to Google.
      const state = randomBytes(32).toString('hex');
      oauthStates.set(state, {
        expiresAt: Date.now() + 10 * 60 * 1000,
        mobile: { redirectUri, clientState },
      });
      cleanExpired(oauthStates);

      const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: google.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
        state,
      });

      return reply.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    },
  );

  // Step 2: Handle callback from Google
  fastify.get(
    '/api/v1/auth/google/callback',
    { config: { public: true } as any },
    async (request, reply) => {
      const google = getGoogleConfig();
      const { code, error, state } = request.query as { code?: string; error?: string; state?: string };

      // Resolve the state entry up front (if present) so error redirects can
      // target the right client — the mobile deep link vs the web frontend.
      const stateEntry = state ? oauthStates.get(state) : undefined;
      if (state) oauthStates.delete(state);

      const errorRedirect = (errorCode: string) => {
        if (stateEntry?.mobile) {
          return reply.redirect(`${stateEntry.mobile.redirectUri}?error=${errorCode}`);
        }
        return reply.redirect(`${google.frontendUrl}/login?error=${errorCode}`);
      };

      if (error || !code) {
        return errorRedirect('google_denied');
      }

      // Validate CSRF state
      if (!state || !stateEntry) {
        return errorRedirect('invalid_state');
      }
      if (stateEntry.expiresAt < Date.now()) {
        return errorRedirect('expired_state');
      }

      try {
        // Exchange code for tokens
        const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: google.clientId,
            client_secret: google.clientSecret,
            redirect_uri: google.redirectUri,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenResp.ok) {
          fastify.log.error(`Google token exchange failed`);
          return errorRedirect('token_failed');
        }

        const tokens = await tokenResp.json() as { access_token: string };

        // Get user profile
        const profileResp = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!profileResp.ok) {
          return errorRedirect('profile_failed');
        }

        const profile = await profileResp.json() as {
          id: string;
          email: string;
          name: string;
          picture: string;
        };

        // Look up user by email
        const [user] = await fastify.db
          .select()
          .from(users)
          .where(eq(users.email, profile.email.toLowerCase()))
          .limit(1);

        if (!user) {
          fastify.log.warn(`Google SSO: no user found for email`);
          return errorRedirect('no_account');
        }

        await logAudit(fastify.db, {
          tenantId: user.tenantId, actorType: 'user', actorId: user.id,
          action: 'auth.login.google', entityType: 'user', entityId: user.id, ipAddress: request.ip,
        });

        // Mobile flow: mint tokens directly and hand them back via deep link.
        if (stateEntry.mobile) {
          const accessToken = fastify.jwt.sign(
            { jti: randomUUID(), sub: user.id, tid: user.tenantId, role: user.role, type: 'access' as const },
            { expiresIn: fastify.config.JWT_EXPIRES_IN || '15m' },
          );
          const refreshToken = fastify.jwt.sign(
            { jti: randomUUID(), sub: user.id, tid: user.tenantId, role: user.role, type: 'refresh' as const },
            { expiresIn: fastify.config.REFRESH_TOKEN_EXPIRES_IN || '7d' },
          );
          const params = new URLSearchParams({ accessToken, refreshToken });
          return reply.redirect(`${stateEntry.mobile.redirectUri}?${params.toString()}`);
        }

        // Generate a short-lived exchange code (NOT tokens in URL)
        const exchangeCode = randomBytes(32).toString('hex');
        exchangeCodes.set(exchangeCode, {
          userId: user.id,
          tenantId: user.tenantId,
          role: user.role,
          displayName: user.displayName,
          email: user.email,
          mfaEnabled: user.mfaEnabled,
          expiresAt: Date.now() + 60 * 1000, // 1 minute TTL
        });
        cleanExpired(exchangeCodes);

        // Redirect with only the exchange code — no tokens in URL
        return reply.redirect(`${google.frontendUrl}/auth/callback?code=${exchangeCode}`);
      } catch (err) {
        fastify.log.error(err, 'Google SSO error');
        return errorRedirect('server_error');
      }
    },
  );

  // Step 3: Exchange code for JWT tokens (called by frontend).
  // Registers the provider-neutral POST /api/v1/auth/exchange plus the legacy
  // POST /api/v1/auth/google/exchange alias (shared handler, shared code map).
  registerAuthExchangeRoutes(fastify);
}
