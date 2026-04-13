import { pgTable, uuid, text, integer, timestamp, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    status: text('status').default('active').notNull(),
    customerType: text('customer_type'), // 'commercial' | 'residential' | 'lead' | 'prospect' | custom
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
    slaPolicyId: uuid('sla_policy_id'),
    rmmPolicyId: uuid('rmm_policy_id'),
    // External system tracking (for ConnectWise / Autotask / Halo imports)
    externalId: text('external_id'),
    externalSource: text('external_source'), // 'connectwise' | 'autotask' | 'halopsa' | 'csv'
    externalNumber: text('external_number'), // human-readable id from source
    customFields: jsonb('custom_fields').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('customers_tenant_status_idx').on(table.tenantId, table.status),
    // Re-imports upsert instead of duplicate
    uniqueIndex('customers_tenant_external_uniq').on(table.tenantId, table.externalSource, table.externalId),
  ],
);

// Per-tenant custom field definitions — reusable across entity types (customer, contact, etc.)
export const tenantCustomFieldDefs = pgTable(
  'tenant_custom_field_defs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(), // 'customer' | 'contact' | 'configuration' | 'catalog_item'
    fieldKey: text('field_key').notNull(), // snake_case identifier
    label: text('label').notNull(),
    fieldType: text('field_type').default('text').notNull(), // 'text' | 'number' | 'date' | 'boolean' | 'select'
    options: jsonb('options'), // for 'select': { choices: [...] }
    displayOrder: integer('display_order').default(0).notNull(),
    required: boolean('required').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('custom_field_defs_tenant_entity_key_uniq').on(table.tenantId, table.entityType, table.fieldKey),
    index('custom_field_defs_tenant_entity_idx').on(table.tenantId, table.entityType),
  ],
);

// Import job audit — every file upload creates a row
export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    source: text('source').notNull(), // 'connectwise' | 'autotask' | 'halopsa' | 'csv'
    entityType: text('entity_type').notNull(), // 'customer' | 'contact' | 'configuration' | 'catalog_item'
    status: text('status').default('pending').notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
    totalRows: integer('total_rows').default(0).notNull(),
    importedRows: integer('imported_rows').default(0).notNull(),
    updatedRows: integer('updated_rows').default(0).notNull(),
    failedRows: integer('failed_rows').default(0).notNull(),
    errors: jsonb('errors').default([]).notNull(), // [{ row, message }]
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('import_jobs_tenant_idx').on(table.tenantId, table.startedAt),
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
