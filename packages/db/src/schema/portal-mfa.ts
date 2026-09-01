import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';

/**
 * Short-lived SMS MFA codes for portal login.
 * Purpose: 'login' = verifying code during login flow, 'setup' = verifying new phone during MFA setup.
 */
export const portalMfaCodes = pgTable(
  'portal_mfa_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    contactId: uuid('contact_id').notNull().references(() => contacts.id),
    codeHash: text('code_hash').notNull(),
    purpose: text('purpose').notNull(), // 'login' | 'setup'
    // Candidate phone for a 'setup' code — copied to contacts.portalMfaPhone
    // only after the code is verified, so setup never redirects the live phone.
    phone: text('phone'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('portal_mfa_codes_contact_idx').on(table.contactId, table.expiresAt),
  ],
);
