import { pgTable, uuid, text, date, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';

export const agreements = pgTable(
  'agreements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    quoteId: uuid('quote_id'),
    contractId: uuid('contract_id'),
    agreementType: text('agreement_type').default('msa').notNull(),
    title: text('title').notNull(),
    // Rendered merge-field snapshot at send time — later template edits never
    // change what a customer signed.
    contentHtml: text('content_html').notNull(),
    status: text('status').default('draft').notNull(), // draft | sent | viewed | signed | declined
    effectiveDate: date('effective_date'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('agreements_tenant_customer_idx').on(table.tenantId, table.customerId),
    index('agreements_quote_idx').on(table.quoteId),
  ],
);
