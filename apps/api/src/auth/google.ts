/**
 * Google OAuth2 SSO - Sign in with Google for Rivertown PSA
 *
 * Flow:
 *   1. GET /api/v1/auth/google → redirect to Google consent
 *   2. Google redirects to /api/v1/auth/google/callback with code
 *   3. Exchange code for tokens, get user profile
 *   4. Match user by email → issue JWT
 *   5. Redirect to frontend with tokens
 */

import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '@rivertown/db';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

function getGoogleConfig(config: any) {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `https://rivertownapi-production.up.railway.app/api/v1/auth/google/callback`,
    frontendUrl: process.env.FRONTEND_URL || 'https://psa.rivertowntechnology.com',
  };
}

export async function googleAuthRoutes(fastify: FastifyInstance) {
  // Step 1: Redirect to Google
  fastify.get(
    '/api/v1/auth/google',
    { config: { public: true } as any },
    async (request, reply) => {
      const google = getGoogleConfig(fastify.config);

      if (!google.clientId) {
        return reply.code(503).send({ error: 'Google SSO not configured' });
      }

      const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: google.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
      });

      return reply.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    },
  );

  // Step 2: Handle callback from Google
  fastify.get(
    '/api/v1/auth/google/callback',
    { config: { public: true } as any },
    async (request, reply) => {
      const google = getGoogleConfig(fastify.config);
      const { code, error } = request.query as { code?: string; error?: string };

      if (error || !code) {
        return reply.redirect(`${google.frontendUrl}/login?error=google_denied`);
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
          const err = await tokenResp.text();
          fastify.log.error(`Google token exchange failed: ${err}`);
          return reply.redirect(`${google.frontendUrl}/login?error=token_failed`);
        }

        const tokens = await tokenResp.json() as { access_token: string };

        // Get user profile
        const profileResp = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!profileResp.ok) {
          return reply.redirect(`${google.frontendUrl}/login?error=profile_failed`);
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
          fastify.log.warn(`Google SSO: no user found for ${profile.email}`);
          return reply.redirect(`${google.frontendUrl}/login?error=no_account`);
        }

        // Issue JWT tokens
        const accessToken = fastify.jwt.sign(
          { sub: user.id, tid: user.tenantId, role: user.role, type: 'access' as const },
          { expiresIn: fastify.config.JWT_EXPIRES_IN || '15m' },
        );

        const refreshToken = fastify.jwt.sign(
          { sub: user.id, tid: user.tenantId, role: user.role, type: 'refresh' as const },
          { expiresIn: fastify.config.REFRESH_TOKEN_EXPIRES_IN || '7d' },
        );

        // Redirect to frontend with tokens
        const params = new URLSearchParams({
          accessToken,
          refreshToken,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
        });

        return reply.redirect(`${google.frontendUrl}/auth/callback?${params.toString()}`);
      } catch (err) {
        fastify.log.error(err, 'Google SSO error');
        return reply.redirect(`${google.frontendUrl}/login?error=server_error`);
      }
    },
  );
}
