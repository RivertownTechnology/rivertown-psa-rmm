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

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
