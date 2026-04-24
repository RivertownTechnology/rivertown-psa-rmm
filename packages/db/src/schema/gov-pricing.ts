import { pgTable, uuid, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { govOpportunities } from './gov-contracts.js';
import { serviceCatalogItems } from './service-catalog.js';

// Maps RFP requirements/needs to service catalog products for pricing
export const govPricingItems = pgTable('gov_pricing_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  opportunityId: uuid('opportunity_id').notNull().references(() => govOpportunities.id),
  need: text('need').notNull(), // The RFP requirement/need (e.g. "Endpoint Protection for 55 workstations")
  catalogItemId: uuid('catalog_item_id').references(() => serviceCatalogItems.id), // Mapped product (nullable — can be unmapped)
  catalogItemName: text('catalog_item_name'), // Snapshot of product name at time of mapping
  quantity: numeric('quantity').default('1'),
  unitPriceCents: integer('unit_price_cents').default(0), // Override price (or from catalog)
  unitCostCents: integer('unit_cost_cents').default(0), // Override cost (or from catalog)
  frequency: text('frequency').default('monthly'), // monthly, annually, one_time
  notes: text('notes'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('gov_pricing_items_opp_idx').on(table.opportunityId),
]);
