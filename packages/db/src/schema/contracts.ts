import { pgTable, uuid, text, boolean, integer, numeric, date, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { assets } from './assets.js';
import { contacts } from './contacts.js';
import { serviceCatalogItems } from './service-catalog.js';

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    name: text('name').notNull(),
    contractType: text('contract_type').notNull(),
    status: text('status').default('draft').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    billingCycle: text('billing_cycle').default('monthly'),
    autoRenew: boolean('auto_renew').default(true).notNull(),
    notes: text('notes'),
    // Default labor line item used by time-entry resolution when a tech doesn't
    // explicitly pick one. Backfilled from the most-likely labor line per contract.
    defaultLaborLineItemId: uuid('default_labor_line_item_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('contracts_tenant_customer_idx').on(table.tenantId, table.customerId),
    index('contracts_tenant_status_idx').on(table.tenantId, table.status),
  ],
);

export const contractLineItems = pgTable(
  'contract_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id),
    description: text('description').notNull(),
    itemType: text('item_type').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    unitCostCents: integer('unit_cost_cents'),
    quantity: numeric('quantity').default('1'),
    category: text('category'),
    blockHours: numeric('block_hours'),
    blockHoursUsed: numeric('block_hours_used').default('0'),
    // Coverage policy drives billing behavior at write-time: 'inclusive' | 'block' | 'billable'.
    coveragePolicy: text('coverage_policy').default('inclusive').notNull(),
    overageRateCents: integer('overage_rate_cents'),         // null on a 'block' line = reject overage
    resetCadence: text('reset_cadence'),                     // null | 'monthly' | 'quarterly' | 'annual'
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    warnAtPct: integer('warn_at_pct').default(80).notNull(),
    taxable: boolean('taxable').default(true).notNull(),
    pax8SubscriptionId: text('pax8_subscription_id'),
    catalogItemId: uuid('catalog_item_id').references(() => serviceCatalogItems.id),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('contract_line_items_contract_idx').on(table.contractId),
  ],
);

export const contractCoveredAssets = pgTable(
  'contract_covered_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
  },
  (table) => [
    uniqueIndex('contract_covered_assets_uniq').on(table.contractId, table.assetId),
  ],
);

export const contractCoveredContacts = pgTable(
  'contract_covered_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id),
  },
  (table) => [
    uniqueIndex('contract_covered_contacts_uniq').on(table.contractId, table.contactId),
  ],
);
