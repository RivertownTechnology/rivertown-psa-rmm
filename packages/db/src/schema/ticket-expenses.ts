import { pgTable, uuid, text, integer, numeric, boolean, date, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { tickets } from './tickets.js';
import { users } from './users.js';

export const ticketExpenses = pgTable('ticket_expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  expenseType: text('expense_type').notNull(), // mileage, parts, parking, meals, travel, other
  description: text('description'),
  amountCents: integer('amount_cents').notNull(),
  quantity: numeric('quantity').default('1'),
  isBillable: boolean('is_billable').default(true).notNull(),
  isBilled: boolean('is_billed').default(false).notNull(),
  expenseDate: date('expense_date').notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ticket_expenses_ticket_idx').on(table.ticketId),
]);
