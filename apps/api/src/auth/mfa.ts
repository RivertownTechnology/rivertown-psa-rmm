import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { users, tenants } from '@rivertown/db';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { UnauthorizedError, ValidationError } from '../common/errors.js';

function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{4}/g)!.join('-'),
  );
}

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

function createTOTP(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: 'Rivertown PSA',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export async function mfaRoutes(fastify: FastifyInstance) {
  // Begin MFA setup — generates secret + QR code
  fastify.post('/api/v1/auth/mfa/setup', async (request) => {
    const [user] = await fastify.db
      .select()
      .from(users)
      .where(
        and(eq(users.id, request.user.sub), eq(users.tenantId, request.user.tid)),
      )
      .limit(1);

    if (!user) throw new UnauthorizedError('User not found');
    if (user.mfaEnabled) throw new ValidationError('MFA is already enabled');

    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'Rivertown PSA',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUrl = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    const backupCodes = generateBackupCodes();

    // Store secret + hashed backup codes (not yet enabled — user must verify first)
    const hashedCodes = backupCodes.map(hashBackupCode);
    await fastify.db
      .update(users)
      .set({
        mfaSecret: secret.base32,
        mfaBackupCodes: hashedCodes,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      otpauthUrl,
      backupCodes,
    };
  });

  // Verify initial MFA setup — enables MFA on account
  fastify.post('/api/v1/auth/mfa/setup/verify', async (request) => {
    const { code } = request.body as { code: string };
    if (!code) throw new ValidationError('Code is required');

    const [user] = await fastify.db
      .select()
      .from(users)
      .where(
        and(eq(users.id, request.user.sub), eq(users.tenantId, request.user.tid)),
      )
      .limit(1);

    if (!user) throw new UnauthorizedError('User not found');
    if (user.mfaEnabled) throw new ValidationError('MFA is already enabled');
    if (!user.mfaSecret) throw new ValidationError('MFA setup not started. Call /auth/mfa/setup first.');

    const totp = createTOTP(user.mfaSecret, user.email);
    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
      throw new ValidationError('Invalid code. Please try again.');
    }

    await fastify.db
      .update(users)
      .set({
        mfaEnabled: true,
        mfaProvider: 'built_in',
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return { success: true, message: 'MFA enabled successfully' };
  });

  // Disable MFA
  fastify.post('/api/v1/auth/mfa/disable', async (request) => {
    const { code } = request.body as { code?: string };

    const [user] = await fastify.db
      .select()
      .from(users)
      .where(
        and(eq(users.id, request.user.sub), eq(users.tenantId, request.user.tid)),
      )
      .limit(1);

    if (!user) throw new UnauthorizedError('User not found');
    if (!user.mfaEnabled) throw new ValidationError('MFA is not enabled');

    // Require a valid code to disable
    if (user.mfaSecret && user.mfaProvider === 'built_in') {
      if (!code) throw new ValidationError('Current MFA code required to disable');
      const totp = createTOTP(user.mfaSecret, user.email);
      const delta = totp.validate({ token: code, window: 1 });
      if (delta === null) throw new ValidationError('Invalid code');
    }

    await fastify.db
      .update(users)
      .set({
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
        mfaProvider: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return { success: true, message: 'MFA disabled' };
  });

  // Get MFA status
  fastify.get('/api/v1/auth/mfa/status', async (request) => {
    const [user] = await fastify.db
      .select({
        mfaEnabled: users.mfaEnabled,
        mfaProvider: users.mfaProvider,
      })
      .from(users)
      .where(
        and(eq(users.id, request.user.sub), eq(users.tenantId, request.user.tid)),
      )
      .limit(1);

    if (!user) throw new UnauthorizedError('User not found');

    // Check if tenant requires MFA
    const [tenant] = await fastify.db
      .select({ mfaRequired: tenants.mfaRequired })
      .from(tenants)
      .where(eq(tenants.id, request.user.tid))
      .limit(1);

    return {
      enabled: user.mfaEnabled,
      provider: user.mfaProvider,
      required: tenant?.mfaRequired ?? false,
    };
  });

  // Verify MFA during login (called with mfaToken, not regular JWT)
  fastify.post(
    '/api/v1/auth/mfa/verify',
    { config: { public: true, rateLimit: { max: 5, timeWindow: '5 minutes' } } as any },
    async (request) => {
      const { mfaToken, code } = request.body as { mfaToken: string; code: string };
      if (!mfaToken || !code) throw new ValidationError('mfaToken and code are required');

      // Validate code format: 6 digits (TOTP) or XXXX-XXXX (backup code)
      if (!/^\d{6}$/.test(code) && !/^[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}$/.test(code)) {
        throw new ValidationError('Invalid code format');
      }

      let payload: { sub: string; tid: string; role: string; type: string };
      try {
        payload = fastify.jwt.verify(mfaToken);
      } catch {
        throw new UnauthorizedError('Invalid or expired MFA token');
      }

      if (payload.type !== 'mfa_challenge') {
        throw new UnauthorizedError('Invalid token type');
      }

      const [user] = await fastify.db
        .select()
        .from(users)
        .where(and(eq(users.id, payload.sub), eq(users.tenantId, payload.tid)))
        .limit(1);

      if (!user || !user.mfaSecret) throw new UnauthorizedError('User not found');

      // Try TOTP code first
      const totp = createTOTP(user.mfaSecret, user.email);
      const delta = totp.validate({ token: code, window: 1 });

      if (delta === null) {
        // Try backup codes (stored as SHA-256 hashes)
        const backupCodes = (user.mfaBackupCodes as string[] | null) ?? [];
        const hashedInput = hashBackupCode(code);
        const codeIndex = backupCodes.indexOf(hashedInput);

        if (codeIndex === -1) {
          throw new UnauthorizedError('Invalid MFA code');
        }

        // Consume the backup code
        const remaining = [...backupCodes];
        remaining.splice(codeIndex, 1);
        await fastify.db
          .update(users)
          .set({ mfaBackupCodes: remaining, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      // Issue real tokens
      const accessToken = fastify.jwt.sign(
        { jti: randomUUID(), sub: user.id, tid: user.tenantId, role: user.role, type: 'access' as const },
        { expiresIn: fastify.config.JWT_EXPIRES_IN },
      );

      const refreshToken = fastify.jwt.sign(
        { jti: randomUUID(), sub: user.id, tid: user.tenantId, role: user.role, type: 'refresh' as const },
        { expiresIn: fastify.config.REFRESH_TOKEN_EXPIRES_IN },
      );

      return {
        accessToken,
        refreshToken,
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
}
