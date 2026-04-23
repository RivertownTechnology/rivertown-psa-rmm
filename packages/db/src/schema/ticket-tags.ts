import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { tickets } from './tickets.js';

export const ticketTags = pgTable('ticket_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  color: text('color').default('#6b7280'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ticketTagAssignments = pgTable('ticket_tag_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id),
  tagId: uuid('tag_id').notNull().references(() => ticketTags.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ticket_tag_assignments_uniq').on(table.ticketId, table.tagId),
]);
