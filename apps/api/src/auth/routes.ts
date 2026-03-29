import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { compare } from 'bcryptjs';
import { users, tenants } from '@rivertown/db';
import { loginSchema } from '@rivertown/shared';
import { UnauthorizedError } from '../common/errors.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/v1/auth/login',
    { config: { public: true } as any },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);

      const [user] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.email, body.email))
        .limit(1);

      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      if (!user.passwordHash) {
        throw new UnauthorizedError('SSO login required for this account');
      }

      const validPassword = await compare(body.password, user.passwordHash);
      if (!validPassword) {
        throw new UnauthorizedError('Invalid email or password');
      }

      if (!user.isActive) {
        throw new UnauthorizedError('Account is disabled');
      }

      // Check if MFA is required (user-level or tenant-level)
      const [tenant] = await fastify.db
        .select({ mfaRequired: tenants.mfaRequired })
        .from(tenants)
        .where(eq(tenants.id, user.tenantId))
        .limit(1);

      if (user.mfaEnabled) {
        // Issue a short-lived MFA challenge token (not a real access token)
        const mfaToken = fastify.jwt.sign(
          { sub: user.id, tid: user.tenantId, role: user.role, type: 'mfa_challenge' as const },
          { expiresIn: '5m' },
        );

        return {
          mfaRequired: true,
          mfaToken,
          mfaProvider: user.mfaProvider,
        };
      }

      // If tenant requires MFA but user hasn't set it up, let them in but flag it
      const mfaSetupRequired = (tenant?.mfaRequired && !user.mfaEnabled) || false;

      const accessToken = fastify.jwt.sign(
        { sub: user.id, tid: user.tenantId, role: user.role, type: 'access' as const },
        { expiresIn: fastify.config.JWT_EXPIRES_IN },
      );

      const refreshToken = fastify.jwt.sign(
        { sub: user.id, tid: user.tenantId, role: user.role, type: 'refresh' as const },
        { expiresIn: fastify.config.REFRESH_TOKEN_EXPIRES_IN },
      );

      return {
        accessToken,
        refreshToken,
        mfaRequired: false,
        mfaSetupRequired,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          tenantId: user.tenantId,
          mfaEnabled: user.mfaEnabled,
        },
      };
    },
  );

  fastify.post('/api/v1/auth/refresh', { config: { public: true } as any }, async (request) => {
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
        { sub: user.id, tid: user.tenantId, role: user.role, type: 'access' as const },
        { expiresIn: fastify.config.JWT_EXPIRES_IN },
      );

      return { accessToken };
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
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) throw new UnauthorizedError('User not found');
    return user;
  });
}
