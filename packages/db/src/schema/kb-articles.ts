import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const kbCategories = pgTable('kb_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const kbArticles = pgTable('kb_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  body: text('body').notNull().default(''),
  categoryId: uuid('category_id').references(() => kbCategories.id),
  visibility: text('visibility').notNull().default('internal'), // internal, portal, public
  status: text('status').notNull().default('draft'), // draft, published
  authorId: uuid('author_id').references(() => users.id),
  viewCount: integer('view_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('kb_articles_tenant_idx').on(table.tenantId, table.status, table.visibility),
]);
