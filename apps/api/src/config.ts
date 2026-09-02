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

  // Comma-separated list of allowed CORS origins (production). If unset, a built-in
  // default list is used. e.g. "https://app.example.com,https://portal.example.com"
  CORS_ORIGINS: z.string().optional(),

  // Public-facing API URL (used in invoice view links sent via email)
  API_BASE_URL: z.string().default('https://rivertownapi-production.up.railway.app'),

  // Google Email OAuth (uses same Google OAuth app as SSO)
  GOOGLE_EMAIL_REDIRECT_URI: z.string().optional(),

  // Microsoft Entra ID SSO (staff "Sign in with Microsoft"). Single-tenant app.
  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),
  MS_TENANT_ID: z.string().optional(),
  MS_REDIRECT_URI: z.string().optional(),
  // Per-user Microsoft 365 Calendar OAuth redirect (frontend callback path).
  // Reuses the same Entra app as SSO; distinct redirect for calendar consent.
  MS_CALENDAR_REDIRECT_URI: z.string().optional(),

  // Customer-portal "Sign in with Microsoft" (App B) — a SEPARATE, MULTI-TENANT
  // Entra app so customers sign in with their own Microsoft 365 tenants.
  // Distinct credentials from App A (staff, above). Authority = /organizations.
  MS_PORTAL_CLIENT_ID: z.string().optional(),
  MS_PORTAL_CLIENT_SECRET: z.string().optional(),
  MS_PORTAL_REDIRECT_URI: z.string().optional(),
  // Customer portal SPA base URL — where the SSO exchange code is delivered.
  PORTAL_URL: z.string().optional(),

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

  // Apple Push Notification service (token-based .p8 auth) for the iOS app
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  // Either the .p8 key contents (PEM, \n-escaped) or a filesystem path to it
  APNS_P8: z.string().optional(),
  APNS_DEFAULT_ENVIRONMENT: z.enum(['sandbox', 'production']).default('production'),
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
