import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

/**
 * Auto-discovered lookup values per tenant — populated during imports.
 *
 * When a user imports 10,000 ConnectWise companies, this table ends up with rows like:
 *   (tenant_id, entity='customer', field='customer_type', value='Managed Services Client', usage_count=142)
 *   (tenant_id, entity='customer', field='customer_type', value='Break-Fix', usage_count=13)
 *   (tenant_id, entity='customer', field='territory',     value='Southeast',            usage_count=78)
 *
 * The UI uses these to offer dropdowns when the user edits a customer,
 * so they don't have to re-type values that already exist in their data.
 */
export const tenantLookupValues = pgTable(
  'tenant_lookup_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(), // 'customer' | 'contact' | 'asset' | 'catalog_item'
    field: text('field').notNull(),             // column or custom-field key
    value: text('value').notNull(),
    usageCount: integer('usage_count').default(0).notNull(),
    source: text('source'),                     // 'connectwise' | 'manual' | 'csv' | null
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('tenant_lookup_values_uniq').on(table.tenantId, table.entityType, table.field, table.value),
    index('tenant_lookup_values_tenant_idx').on(table.tenantId, table.entityType, table.field),
  ],
);
