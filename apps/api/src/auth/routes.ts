import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { compare } from 'bcryptjs';
import { users, tenants } from '@rivertown/db';
import { loginSchema } from '@rivertown/shared';
import { UnauthorizedError } from '../common/errors.js';
import { logAudit } from '../common/audit.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/v1/auth/login',
    { config: { public: true, rateLimit: { max: 5, timeWindow: '5 minutes' } } as any },
    async (request, reply) => {
      // Password login disabled — use Google SSO
      throw new UnauthorizedError('Password login is disabled. Please sign in with Google SSO.');
    },
  );

  fastify.post('/api/v1/auth/refresh', { config: { public: true, rateLimit: { max: 10, timeWindow: '1 minute' } } as any }, async (request) => {
    try {
      const token = (request.body as { refreshToken?: string })?.refreshToken;
      if (!token) throw new UnauthorizedError('Refresh token required');

      const payload = fastify.jwt.verify<{
        jti?: string;
        exp?: number;
        sub: string;
        tid: string;
        role: string;
        type: string;
      }>(token);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      // Rotation with reuse detection: a refresh token is single-use. If it has
      // already been consumed (blacklisted), reject — someone is replaying it.
      const { isTokenBlacklisted, blacklistToken } = await import('../common/token-blacklist.js');
      if (payload.jti) {
        if (await isTokenBlacklisted(payload.jti)) {
          throw new UnauthorizedError('Refresh token already used');
        }
        if (payload.exp) await blacklistToken(payload.jti, payload.exp);
      }

      const [user] = await fastify.db
        .select()
        .from(users)
        .where(and(eq(users.id, payload.sub), eq(users.tenantId, payload.tid)))
        .limit(1);

      if (!user || !user.isActive) {
        throw new UnauthorizedError('User not found or inactive');
      }

      const accessToken = fastify.jwt.sign(
        { jti: randomUUID(), sub: user.id, tid: user.tenantId, role: user.role, type: 'access' as const },
        { expiresIn: fastify.config.JWT_EXPIRES_IN },
      );

      // Rotate refresh token
      const newRefreshToken = fastify.jwt.sign(
        { jti: randomUUID(), sub: user.id, tid: user.tenantId, role: user.role, type: 'refresh' as const },
        { expiresIn: fastify.config.REFRESH_TOKEN_EXPIRES_IN },
      );

      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }
  });

  fastify.get('/api/v1/auth/me', async (request) => {
    const payload = request.user;
    const [user] = await fastify.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        tenantId: users.tenantId,
        mfaEnabled: users.mfaEnabled,
        mfaProvider: users.mfaProvider,
      })
      .from(users)
      .where(and(eq(users.id, payload.sub), eq(users.tenantId, payload.tid)))
      .limit(1);

    if (!user) throw new UnauthorizedError('User not found');
    // `name` is an alias of `displayName` for clients (e.g. the iOS app) that
    // expect that exact key — displayName is kept for the existing web app.
    return { ...user, name: user.displayName };
  });

  // Logout — blacklist current access token AND the caller's refresh token
  fastify.post('/api/v1/auth/logout', async (request) => {
    const { blacklistToken } = await import('../common/token-blacklist.js');
    const payload = request.user;
    if (payload.jti && payload.exp) {
      await blacklistToken(payload.jti, payload.exp);
    }
    // Revoke the refresh token too, if the client sends it — otherwise a "logged
    // out" refresh token could still mint new access tokens.
    const refreshToken = (request.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (refreshToken) {
      try {
        const rp = fastify.jwt.verify<{ jti?: string; exp?: number; type: string }>(refreshToken);
        if (rp.type === 'refresh' && rp.jti && rp.exp) await blacklistToken(rp.jti, rp.exp);
      } catch { /* ignore malformed refresh token on logout */ }
    }
    return { success: true };
  });
}
