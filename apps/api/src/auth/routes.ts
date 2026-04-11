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
        sub: string;
        tid: string;
        role: string;
        type: string;
      }>(token);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
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
    return user;
  });

  // Logout — blacklist current token
  fastify.post('/api/v1/auth/logout', async (request) => {
    const { blacklistToken } = await import('../common/token-blacklist.js');
    const payload = request.user;
    if (payload.jti && payload.exp) {
      await blacklistToken(payload.jti, payload.exp);
    }
    return { success: true };
  });
}
