import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { users, tenants, tenantSsoConfigs } from '@rivertown/db';
import { loginSchema, computeEntitlements } from '@rivertown/shared';
import { UnauthorizedError } from '../common/errors.js';
import { logAudit } from '../common/audit.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/v1/auth/login',
    { config: { public: true, rateLimit: { max: 5, timeWindow: '5 minutes' } } as any },
    async (request) => {
      const { email, password } = loginSchema.parse(request.body);

      const [user] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user || !user.isActive || !user.passwordHash) {
        throw new UnauthorizedError('Invalid credentials');
      }

      const valid = await compare(password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedError('Invalid credentials');
      }

      await logAudit(fastify.db, {
        tenantId: user.tenantId,
        actorType: 'user',
        actorId: user.id,
        action: 'login',
        entityType: 'user',
        entityId: user.id,
      });

      const accessToken = fastify.jwt.sign(
        { jti: randomUUID(), sub: user.id, tid: user.tenantId, role: user.role, type: 'access' as const },
        { expiresIn: fastify.config.JWT_EXPIRES_IN },
      );
      const refreshToken = fastify.jwt.sign(
        { jti: randomUUID(), sub: user.id, tid: user.tenantId, role: user.role, type: 'refresh' as const },
        { expiresIn: fastify.config.REFRESH_TOKEN_EXPIRES_IN },
      );

      return { accessToken, refreshToken };
    },
  );

  // SSO discovery — email-first login flow. Given an email, return which auth method
  // the user should use based on the tenant's SSO config for their email domain.
  // Deliberately does NOT reveal whether the email exists (prevents enumeration).
  fastify.post(
    '/api/v1/auth/sso-lookup',
    { config: { public: true, rateLimit: { max: 20, timeWindow: '1 minute' } } as any },
    async (request) => {
      const body = z.object({
        email: z.string().trim().toLowerCase().email(),
      }).safeParse(request.body);

      if (!body.success) {
        return { method: 'password' as const };
      }

      const domain = body.data.email.split('@')[1];
      if (!domain) return { method: 'password' as const };

      // Look up active SSO config for this domain. We match on the domain column,
      // not on user existence — so unknown emails still get a generic response.
      const [sso] = await fastify.db
        .select({
          provider: tenantSsoConfigs.provider,
          isEnabled: tenantSsoConfigs.isEnabled,
        })
        .from(tenantSsoConfigs)
        .where(and(
          eq(tenantSsoConfigs.domain, domain),
          eq(tenantSsoConfigs.isEnabled, true),
        ))
        .limit(1);

      if (sso?.provider) {
        return {
          method: 'sso' as const,
          provider: sso.provider, // 'microsoft' | 'google' | 'saml'
          // Future: redirectUrl will point to the OAuth/SAML initiation endpoint per provider.
          // Until Microsoft/SAML are implemented, the UI falls back to Google SSO if provider === 'google'
          // or shows password if the provider isn't yet wired.
        };
      }

      return { method: 'password' as const };
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
    const [row] = await fastify.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        tenantId: users.tenantId,
        mfaEnabled: users.mfaEnabled,
        mfaProvider: users.mfaProvider,
        isSuperAdmin: users.isSuperAdmin,
        tenantName: tenants.name,
        trialEndsAt: tenants.trialEndsAt,
        subscriptionStatus: tenants.subscriptionStatus,
        planTier: tenants.planTier,
        pastDueAt: tenants.pastDueAt,
        featureFlags: tenants.featureFlags,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(eq(users.id, payload.sub), eq(users.tenantId, payload.tid)))
      .limit(1);

    if (!row) throw new UnauthorizedError('User not found');

    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const GRACE_DAYS = 30;

    const trialDaysRemaining = row.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(row.trialEndsAt).getTime() - now) / MS_PER_DAY))
      : null;
    const trialExpired = row.subscriptionStatus === 'trial'
      && row.trialEndsAt != null
      && new Date(row.trialEndsAt).getTime() < now;

    // Past-due grace period: once Stripe reports a failed renewal we set pastDueAt.
    // Customers keep full access for 30 days, then login is gated to the billing screen.
    const pastDueDaysRemaining = row.pastDueAt
      ? Math.max(0, GRACE_DAYS - Math.floor((now - new Date(row.pastDueAt).getTime()) / MS_PER_DAY))
      : null;
    const graceExpired = row.pastDueAt != null
      && now - new Date(row.pastDueAt).getTime() > GRACE_DAYS * MS_PER_DAY;

    const lockedOut = (
      row.subscriptionStatus === 'cancelled'
      || trialExpired
      || (row.subscriptionStatus === 'past_due' && graceExpired)
    );

    const entitlements = computeEntitlements(
      row.planTier,
      row.featureFlags as Record<string, boolean>,
    );

    // Don't expose raw feature_flags blob on the response — entitlements is the computed view.
    const { featureFlags: _ff, ...rest } = row;
    void _ff;

    return {
      ...rest,
      trialDaysRemaining,
      trialExpired,
      pastDueDaysRemaining,
      lockedOut,
      entitlements,
    };
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
