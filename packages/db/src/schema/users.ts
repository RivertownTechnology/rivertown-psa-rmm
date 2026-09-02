import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull(),
    role: text('role').notNull().default('tech'),
    isActive: boolean('is_active').default(true).notNull(),

    // Cost tracking
    internalCostCents: integer('internal_cost_cents'), // per-hour internal cost for this tech (null = use org default)
    billableRateCents: integer('billable_rate_cents'),  // per-hour billable rate for this tech (null = use org default)

    // MFA
    mfaEnabled: boolean('mfa_enabled').default(false).notNull(),
    mfaSecret: text('mfa_secret'),
    mfaBackupCodes: jsonb('mfa_backup_codes'),
    mfaProvider: text('mfa_provider'),

    // SSO
    ssoProvider: text('sso_provider'),
    ssoSubjectId: text('sso_subject_id'),
    ssoTenantId: text('sso_tenant_id'),

    timezone: text('user_timezone'),
    googleCalendarConnected: boolean('google_calendar_connected').default(false),
    googleCalendarToken: text('google_calendar_token'),
    googleCalendarRefreshToken: text('google_calendar_refresh_token'),

    // Microsoft 365 (Outlook) Calendar — per-user delegated Graph sync
    msCalendarConnected: boolean('ms_calendar_connected').default(false).notNull(),
    msCalendarToken: text('ms_calendar_token'),
    msCalendarRefreshToken: text('ms_calendar_refresh_token'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('users_tenant_email_idx').on(table.tenantId, table.email)],
);
