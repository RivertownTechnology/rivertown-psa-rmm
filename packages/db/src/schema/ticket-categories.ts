import { pgTable, uuid, text, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const ticketCategories = pgTable(
  'ticket_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ticket_categories_tenant_slug_idx').on(table.tenantId, table.slug),
    index('ticket_categories_tenant_active_idx').on(table.tenantId, table.isActive),
  ],
);

export const ticketSubcategories = pgTable(
  'ticket_subcategories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => ticketCategories.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ticket_subcategories_tenant_cat_slug_idx').on(table.tenantId, table.categoryId, table.slug),
    index('ticket_subcategories_category_idx').on(table.categoryId),
  ],
);
