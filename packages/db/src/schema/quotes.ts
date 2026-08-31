import { pgTable, uuid, text, integer, numeric, boolean, date, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { contacts } from './contacts.js';

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    quoteNumber: integer('quote_number').notNull(),
    status: text('status').default('draft').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    validUntil: date('valid_until'),
    subtotalCents: integer('subtotal_cents').default(0).notNull(),
    taxCents: integer('tax_cents').default(0).notNull(),
    totalCents: integer('total_cents').default(0).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    declineReason: text('decline_reason'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => contacts.id),
    convertedContractId: uuid('converted_contract_id'),
    convertedInvoiceId: uuid('converted_invoice_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quotes_tenant_number_idx').on(table.tenantId, table.quoteNumber),
    index('quotes_tenant_status_idx').on(table.tenantId, table.status),
  ],
);

export const quoteLineItems = pgTable(
  'quote_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id),
    description: text('description').notNull(),
    itemType: text('item_type').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: numeric('quantity').default('1'),
    sortOrder: integer('sort_order').default(0),
    taxable: boolean('taxable').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('quote_line_items_quote_idx').on(table.quoteId),
  ],
);
