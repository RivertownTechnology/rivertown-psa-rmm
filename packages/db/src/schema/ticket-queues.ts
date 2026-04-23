import { pgTable, uuid, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const ticketQueues = pgTable('ticket_queues', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#3b82f6'),
  isDefault: boolean('is_default').default(false).notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
