import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // ticket_assigned, sla_warning, customer_replied, ticket_created
  title: text('title').notNull(),
  body: text('body'),
  entityType: text('entity_type'), // ticket, invoice, customer
  entityId: uuid('entity_id'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('notifications_user_unread_idx').on(table.userId, table.isRead),
]);
