import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://rivertown:rivertown@localhost:5432/rivertown'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)').optional(),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Public-facing API URL (used in invoice view links sent via email)
  API_BASE_URL: z.string().default('https://rivertownapi-production.up.railway.app'),

  // Google Email OAuth (uses same Google OAuth app as SSO)
  GOOGLE_EMAIL_REDIRECT_URI: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_PATH: z.string().default('stripe'),

  // AI (Anthropic Claude)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Twilio env vars are now optional fallback only.
  // Preferred: configure per-tenant in Settings > Integrations > Twilio (stored encrypted in DB).
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Passkeys (WebAuthn)
  PASSKEY_RP_ID: z.string().default('portal.rivertowntechnology.com'),
  PASSKEY_ORIGIN: z.string().default('https://portal.rivertowntechnology.com'),

  // QuickBooks Online
  QBO_CLIENT_ID: z.string().optional(),
  QBO_CLIENT_SECRET: z.string().optional(),
  QBO_REDIRECT_URI: z.string().optional(),
  QBO_SANDBOX: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}
