import { pgTable, uuid, text, integer, boolean, numeric, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const taxRates = pgTable(
  'tax_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    state: text('state').notNull(),          // 2-letter state code (SC, NC)
    county: text('county'),                   // County name (Horry, Mecklenburg) — null = state-level default
    combinedRate: numeric('combined_rate', { precision: 6, scale: 4 }).notNull(), // e.g. 8.0000 for 8%
    stateRate: numeric('state_rate', { precision: 6, scale: 4 }),     // state portion (e.g. 6.0000)
    countyRate: numeric('county_rate', { precision: 6, scale: 4 }),   // county/local portion (e.g. 2.0000)
    appliesToProducts: boolean('applies_to_products').default(true).notNull(),
    appliesToServices: boolean('applies_to_services').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tax_rates_tenant_state_idx').on(table.tenantId, table.state),
    uniqueIndex('tax_rates_tenant_state_county_idx').on(table.tenantId, table.state, table.county),
  ],
);
