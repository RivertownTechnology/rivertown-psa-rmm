import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
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
    county: text('county'),
    website: text('website'),
    notes: text('notes'),
    creditBalanceCents: integer('credit_balance_cents').default(0).notNull(),
    qboCustomerId: text('qbo_customer_id'),
    stripeCustomerId: text('stripe_customer_id'),
    pax8CompanyId: text('pax8_company_id'),
    screenconnectCompany: text('screenconnect_company'),
    ncentralName: text('ncentral_name'), // N-central customer name (for mapping when names differ)
    slaPolicyId: uuid('sla_policy_id'),
    rmmPolicyId: uuid('rmm_policy_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('customers_tenant_status_idx').on(table.tenantId, table.status),
  ],
);

// Account credit transactions — tracks every credit add/apply/expire
export const accountCredits = pgTable(
  'account_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    type: text('type').notNull(), // 'credit' (add), 'debit' (apply to invoice), 'expire', 'refund'
    amountCents: integer('amount_cents').notNull(), // positive for credits, negative for debits
    balanceAfterCents: integer('balance_after_cents').notNull(),
    invoiceId: uuid('invoice_id'), // which invoice was credited/debited
    reason: text('reason'),
    createdBy: uuid('created_by'), // user who created the transaction
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('account_credits_customer_idx').on(table.tenantId, table.customerId),
  ],
);
