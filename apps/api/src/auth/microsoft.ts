/**
 * Microsoft Entra ID SSO — Sign in with Microsoft for Rivertown PSA (staff).
 *
 * Mirrors the Google SSO flow (see google.ts):
 *   1. GET /api/v1/auth/microsoft → redirect to Entra consent (with CSRF state)
 *   2. Entra redirects to /api/v1/auth/microsoft/callback with code + state
 *   3. Validate state, exchange code, verify the id_token via tenant JWKS
 *   4. Match a staff user by lowercased email (NO auto-provisioning)
 *   5. Record the Microsoft identity on the user row, mint a one-time
 *      exchange code, and redirect to the frontend with that code
 *   6. Frontend POSTs the code to /api/v1/auth/exchange to get JWT tokens
 *
 * Single Entra tenant only. The token `tid` must equal MS_TENANT_ID, and once a
 * user's ssoSubjectId (oid) is recorded, later logins must present the same oid.
 */

import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { users } from '@rivertown/db';
import { logAudit } from '../common/audit.js';
import { oauthStates, exchangeCodes, cleanExpired } from './oauth-shared.js';
import {
  getMicrosoftConfig,
  isMicrosoftConfigured,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  validateIdToken,
} from './microsoft-oauth.js';

const MS_SCOPES = ['openid', 'email', 'profile', 'User.Read'];

export async function microsoftAuthRoutes(fastify: FastifyInstance) {
  // Step 1: Redirect to Entra with CSRF state
  fastify.get(
    '/api/v1/auth/microsoft',
    { config: { public: true } as any },
    async (_request, reply) => {
      const cfg = getMicrosoftConfig();

      if (!isMicrosoftConfigured(cfg)) {
        return reply.code(503).send({ error: 'Microsoft SSO is not configured' });
      }

      const state = randomBytes(32).toString('hex');
      oauthStates.set(state, { expiresAt: Date.now() + 10 * 60 * 1000 });
      cleanExpired(oauthStates);

      const url = buildAuthorizeUrl({
        state,
        redirectUri: cfg.redirectUri,
        clientId: cfg.clientId,
        tenant: cfg.tenantId,
        scopes: MS_SCOPES,
        prompt: 'select_account',
      });

      return reply.redirect(url);
    },
  );

  // Step 2: Handle callback from Entra
  fastify.get(
    '/api/v1/auth/microsoft/callback',
    { config: { public: true } as any },
    async (request, reply) => {
      const cfg = getMicrosoftConfig();
      const { code, error, state } = request.query as { code?: string; error?: string; state?: string };

      const stateEntry = state ? oauthStates.get(state) : undefined;
      if (state) oauthStates.delete(state);

      const errorRedirect = (errorCode: string) =>
        reply.redirect(`${cfg.frontendUrl}/login?error=${errorCode}`);

      if (error || !code) {
        return errorRedirect('microsoft_denied');
      }

      // Validate CSRF state
      if (!state || !stateEntry) {
        return errorRedirect('invalid_state');
      }
      if (stateEntry.expiresAt < Date.now()) {
        return errorRedirect('expired_state');
      }

      if (!isMicrosoftConfigured(cfg)) {
        return reply.code(503).send({ error: 'Microsoft SSO is not configured' });
      }

      try {
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens({
          code,
          redirectUri: cfg.redirectUri,
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret,
          tenant: cfg.tenantId,
          scopes: MS_SCOPES,
        });

        if (!tokens.id_token) {
          fastify.log.error('Microsoft token exchange returned no id_token');
          return errorRedirect('token_failed');
        }

        // Verify the id_token (signature/issuer/audience/exp) via tenant JWKS
        const identity = await validateIdToken(tokens.id_token, {
          tenant: cfg.tenantId,
          clientId: cfg.clientId,
        });

        // Defense in depth: the token's tenant must be our configured tenant.
        if (identity.tid !== cfg.tenantId) {
          fastify.log.warn('Microsoft SSO: token tenant (tid) does not match MS_TENANT_ID');
          return errorRedirect('tenant_mismatch');
        }

        const emailLower = (identity.email || identity.preferredUsername || '').toLowerCase();
        if (!emailLower) {
          return errorRedirect('no_account');
        }

        // Look up staff user by email — NO auto-provisioning
        const [user] = await fastify.db
          .select()
          .from(users)
          .where(eq(users.email, emailLower))
          .limit(1);

        if (!user) {
          fastify.log.warn('Microsoft SSO: no user found for email');
          return errorRedirect('no_account');
        }

        // If we've already bound this user to a Microsoft identity, the incoming
        // oid must match — prevents a different Entra object taking over the row.
        if (user.ssoSubjectId && user.ssoSubjectId !== identity.oid) {
          fastify.log.warn('Microsoft SSO: oid mismatch for existing user');
          return errorRedirect('identity_mismatch');
        }

        // Record (or refresh) the Microsoft identity on the user row.
        await fastify.db
          .update(users)
          .set({
            ssoProvider: 'microsoft',
            ssoSubjectId: identity.oid,
            ssoTenantId: identity.tid,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        await logAudit(fastify.db, {
          tenantId: user.tenantId, actorType: 'user', actorId: user.id,
          action: 'auth.login.microsoft', entityType: 'user', entityId: user.id, ipAddress: request.ip,
        });

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

        return reply.redirect(`${cfg.frontendUrl}/auth/callback?code=${exchangeCode}`);
      } catch (err) {
        fastify.log.error(err, 'Microsoft SSO error');
        return errorRedirect('server_error');
      }
    },
  );
}
