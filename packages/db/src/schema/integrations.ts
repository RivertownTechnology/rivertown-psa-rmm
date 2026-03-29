import { pgTable, uuid, text, boolean, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { contractLineItems } from './contracts.js';

export const integrationConfigs = pgTable(
  'integration_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    provider: text('provider').notNull(),
    isEnabled: boolean('is_enabled').default(false).notNull(),
    credentials: jsonb('credentials').default({}).notNull(),
    settings: jsonb('settings').default({}),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    syncStatus: text('sync_status').default('idle'),
    syncError: text('sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('integration_configs_tenant_provider_idx').on(table.tenantId, table.provider),
  ],
);

export const pax8Subscriptions = pgTable(
  'pax8_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    pax8SubscriptionId: text('pax8_subscription_id').notNull(),
    pax8CompanyId: text('pax8_company_id').notNull(),
    customerId: uuid('customer_id').references(() => customers.id),
    productName: text('product_name').notNull(),
    quantity: text('quantity'),
    unitPriceCents: text('unit_price_cents'),
    billingTerm: text('billing_term'),
    startDate: text('start_date'),
    status: text('status'),
    contractLineItemId: uuid('contract_line_item_id').references(() => contractLineItems.id),
    rawData: jsonb('raw_data'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('pax8_subscriptions_tenant_idx').on(table.tenantId),
    index('pax8_subscriptions_customer_idx').on(table.customerId),
  ],
);
