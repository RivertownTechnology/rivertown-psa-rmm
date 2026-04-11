import { pgTable, uuid, text, integer, numeric, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const serviceCatalogItems = pgTable(
  'service_catalog_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    sku: text('sku'),
    vendor: text('vendor'),
    category: text('category').notNull(),
    itemType: text('item_type').notNull(),
    defaultUnitCostCents: integer('default_unit_cost_cents'),
    defaultUnitPriceCents: integer('default_unit_price_cents').notNull(),
    defaultBlockHours: numeric('default_block_hours'),

    // Pax8 sync fields
    pax8ProductName: text('pax8_product_name'),
    pax8ProductId: text('pax8_product_id'),
    pax8VendorName: text('pax8_vendor_name'),

    // QuickBooks Online mapping
    qboItemId: text('qbo_item_id'),
    qboIncomeAccountId: text('qbo_income_account_id'),
    qboCogAccountId: text('qbo_cog_account_id'),

    taxable: boolean('taxable').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('service_catalog_items_tenant_idx').on(table.tenantId, table.isActive),
    index('service_catalog_items_category_idx').on(table.tenantId, table.category),
    index('service_catalog_items_sku_idx').on(table.tenantId, table.sku),
  ],
);

export const serviceCatalogBundles = pgTable(
  'service_catalog_bundles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('service_catalog_bundles_tenant_idx').on(table.tenantId),
  ],
);

export const serviceCatalogBundleItems = pgTable(
  'service_catalog_bundle_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bundleId: uuid('bundle_id')
      .notNull()
      .references(() => serviceCatalogBundles.id),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => serviceCatalogItems.id),
    quantityMultiplier: numeric('quantity_multiplier').default('1'),
    sortOrder: integer('sort_order').default(0),
  },
  (table) => [
    index('bundle_items_bundle_idx').on(table.bundleId),
  ],
);
