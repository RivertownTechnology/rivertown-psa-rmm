import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    status: text('status').default('active').notNull(),
    billingEmail: text('billing_email'),
    ccBillingEmail: text('cc_billing_email'),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    zip: text('zip'),
    website: text('website'),
    notes: text('notes'),
    qboCustomerId: text('qbo_customer_id'),
    stripeCustomerId: text('stripe_customer_id'),
    pax8CompanyId: text('pax8_company_id'),
    slaPolicyId: uuid('sla_policy_id'),
    rmmPolicyId: uuid('rmm_policy_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('customers_tenant_status_idx').on(table.tenantId, table.status),
  ],
);
