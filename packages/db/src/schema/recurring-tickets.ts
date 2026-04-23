import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { users } from './users.js';

export const recurringTicketRules = pgTable('recurring_ticket_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  // Schedule
  frequency: text('frequency').notNull(), // daily, weekly, monthly
  dayOfWeek: integer('day_of_week'), // 0-6 for weekly
  dayOfMonth: integer('day_of_month'), // 1-31 for monthly
  // Ticket template
  customerId: uuid('customer_id').references(() => customers.id),
  subject: text('subject').notNull(),
  description: text('description'),
  priority: text('priority').default('medium'),
  categoryId: uuid('category_id'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  queueId: uuid('queue_id'),
  tags: jsonb('tags'), // array of tag IDs
  // Tracking
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
