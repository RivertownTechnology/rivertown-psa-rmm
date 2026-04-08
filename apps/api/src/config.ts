import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://rivertown:rivertown@localhost:5432/rivertown'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().min(16).optional(),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Microsoft 365 OAuth (Azure App Registration)
  MS365_CLIENT_ID: z.string().optional(),
  MS365_CLIENT_SECRET: z.string().optional(),
  MS365_REDIRECT_URI: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
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
