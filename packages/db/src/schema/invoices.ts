import { pgTable, uuid, text, integer, boolean, numeric, date, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { contractLineItems } from './contracts.js';
import { serviceCatalogItems } from './service-catalog.js';

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    invoiceNumber: integer('invoice_number').notNull(),
    status: text('status').default('draft').notNull(),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    subtotalCents: integer('subtotal_cents').default(0).notNull(),
    taxCents: integer('tax_cents').default(0).notNull(),
    // Tax basis frozen at calculation time so a county filing stays
    // reproducible even after the customer's address is later corrected.
    taxState: text('tax_state'),
    taxCounty: text('tax_county'),
    taxCombinedRate: numeric('tax_combined_rate', { precision: 6, scale: 4 }),
    taxStateRate: numeric('tax_state_rate', { precision: 6, scale: 4 }),
    taxCountyRate: numeric('tax_county_rate', { precision: 6, scale: 4 }),
    taxableProductsCents: integer('taxable_products_cents').default(0).notNull(),
    taxableServicesCents: integer('taxable_services_cents').default(0).notNull(),
    exemptCents: integer('exempt_cents').default(0).notNull(),
    totalCents: integer('total_cents').default(0).notNull(),
    amountPaidCents: integer('amount_paid_cents').default(0).notNull(),
    creditsAppliedCents: integer('credits_applied_cents').default(0).notNull(),
    qboInvoiceId: text('qbo_invoice_id'),
    stripeInvoiceId: text('stripe_invoice_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('invoices_tenant_number_idx').on(table.tenantId, table.invoiceNumber),
    index('invoices_tenant_status_idx').on(table.tenantId, table.status),
    index('invoices_tenant_tax_jurisdiction_idx').on(table.tenantId, table.taxState, table.taxCounty, table.issueDate),
  ],
);

export const invoiceLineItems = pgTable(
  'invoice_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    description: text('description').notNull(),
    quantity: numeric('quantity').default('1'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    unitCostCents: integer('unit_cost_cents'),
    taxable: boolean('taxable').default(true).notNull(),
    contractLineItemId: uuid('contract_line_item_id').references(() => contractLineItems.id),
    catalogItemId: uuid('catalog_item_id').references(() => serviceCatalogItems.id),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('invoice_line_items_invoice_idx').on(table.invoiceId),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    amountCents: integer('amount_cents').notNull(),
    paymentMethod: text('payment_method').notNull(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    qboPaymentId: text('qbo_payment_id'),
    reference: text('reference'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('payments_invoice_idx').on(table.invoiceId),
  ],
);
