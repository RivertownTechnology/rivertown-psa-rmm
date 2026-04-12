import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  settings: jsonb('settings').default({}),
  subscriptionTier: text('subscription_tier').default('trial'),

  // Billing defaults
  defaultInternalCostCents: integer('default_internal_cost_cents').default(7500), // $75/hr default
  defaultBillableRateCents: integer('default_billable_rate_cents').default(15000), // $150/hr default
  timezone: text('timezone').default('America/New_York'),

  // Auth settings
  mfaRequired: boolean('mfa_required').default(false).notNull(),
  ssoEnabled: boolean('sso_enabled').default(false).notNull(),
  ssoProvider: text('sso_provider'),
  ssoConfig: jsonb('sso_config'),

  // SaaS billing / trial
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  subscriptionStatus: text('subscription_status').default('trial').notNull(), // trial | active | past_due | cancelled
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  planTier: text('plan_tier').default('starter').notNull(), // starter | pro | enterprise
  pastDueAt: timestamp('past_due_at', { withTimezone: true }), // first failed renewal; 30-day grace before lockout

  // Onboarding — drives product behavior (hide billing UI for Internal IT, seed catalog by billing model, etc.)
  companyType: text('company_type').default('msp').notNull(), // 'msp' | 'internal_it'
  billingModel: text('billing_model'), // 'per_user' | 'per_device' | 'flat_rate' | 'hybrid' | 'none'
  currency: text('currency').default('USD').notNull(),

  // Per-tenant feature flags — overrides default plan-based gates
  featureFlags: jsonb('feature_flags').default({}).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tenantSsoConfigs = pgTable('tenant_sso_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'microsoft' | 'google' | 'saml'
  domain: text('domain'), // email domain for auto-lookup
  credentials: text('credentials'), // encrypted JSON
  samlMetadataUrl: text('saml_metadata_url'),
  samlCertificate: text('saml_certificate'),
  isEnabled: boolean('is_enabled').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
