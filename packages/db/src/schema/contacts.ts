import { pgTable, uuid, text, boolean, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
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
    jobTitle: text('job_title'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    portalEnabled: boolean('portal_enabled').default(false).notNull(),
    portalPasswordHash: text('portal_password_hash'),
    portalRole: text('portal_role').default('user'),  // 'admin' | 'user'
    portalPermissions: jsonb('portal_permissions').default(['tickets']),  // ['tickets', 'billing']
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('contacts_tenant_customer_idx').on(table.tenantId, table.customerId),
  ],
);
