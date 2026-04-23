import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { tickets } from './tickets.js';
import { contacts } from './contacts.js';

export const csatRatings = pgTable('csat_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id),
  contactId: uuid('contact_id').references(() => contacts.id),
  rating: integer('rating'), // null=unrated, 1=unhappy, 2=neutral, 3=happy
  comment: text('comment'),
  token: text('token').notNull(), // unique token for the rating link
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('csat_ratings_ticket_idx').on(table.ticketId),
  index('csat_ratings_token_idx').on(table.token),
]);
