import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// Customer support intake. Every submission via /api/v1/support/tickets creates
// a row here AND emails support@forgepsa.com — the row is the source of truth
// for the admin inbox; email is just for push notification.
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ref: text('ref').notNull().unique(), // e.g. SUP-A1B2C3D4 — shown to customer
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    userEmail: text('user_email').notNull(),
    category: text('category').notNull(), // bug | question | feature | billing
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    status: text('status').default('open').notNull(), // open | replied | closed
    emailSent: boolean('email_sent').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('support_tickets_status_idx').on(table.status, table.createdAt),
    index('support_tickets_tenant_idx').on(table.tenantId),
  ],
);
