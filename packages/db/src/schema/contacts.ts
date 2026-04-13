import { pgTable, uuid, text, integer, boolean, timestamp, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    mobilePhone: text('mobile_phone'),
    jobTitle: text('job_title'),
    department: text('department'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    disabled: boolean('disabled').default(false).notNull(),
    portalEnabled: boolean('portal_enabled').default(false).notNull(),
    portalPasswordHash: text('portal_password_hash'),
    portalRole: text('portal_role').default('user'),  // 'admin' | 'user'
    portalPermissions: jsonb('portal_permissions').default(['tickets']),  // ['tickets', 'billing']
    mustChangePassword: boolean('must_change_password').default(false).notNull(),
    portalMfaEnabled: boolean('portal_mfa_enabled').default(false).notNull(),
    portalMfaMethod: text('portal_mfa_method'),  // 'sms' | 'duo' — future use
    portalMfaPhone: text('portal_mfa_phone'),  // E.164 format
    portalMfaVerifiedAt: timestamp('portal_mfa_verified_at', { withTimezone: true }),
    portalLoginsWithoutMfa: integer('portal_logins_without_mfa').default(0).notNull(),
    // Import tracking
    externalId: text('external_id'),
    externalSource: text('external_source'),
    externalNumber: text('external_number'),
    customFields: jsonb('custom_fields').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('contacts_tenant_customer_idx').on(table.tenantId, table.customerId),
    uniqueIndex('contacts_tenant_external_uniq').on(table.tenantId, table.externalSource, table.externalId),
  ],
);
