import { pgTable, uuid, text, boolean, integer, timestamp, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const customFieldDefinitions = pgTable('custom_field_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  entityType: text('entity_type').notNull(), // ticket, customer, asset, contract
  fieldName: text('field_name').notNull(),
  fieldLabel: text('field_label').notNull(),
  fieldType: text('field_type').notNull().default('text'), // text, number, dropdown, date, checkbox
  options: jsonb('options'), // for dropdown: [{value, label}]
  required: boolean('required').default(false).notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customFieldValues = pgTable('custom_field_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  definitionId: uuid('definition_id').notNull().references(() => customFieldDefinitions.id),
  entityId: uuid('entity_id').notNull(),
  value: text('value'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('custom_field_values_uniq').on(table.definitionId, table.entityId),
]);
