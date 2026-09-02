import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';
import { tickets } from './tickets.js';

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    ticketId: uuid('ticket_id').references(() => tickets.id),
    title: text('title').notNull(),
    description: text('description'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    eventType: text('event_type').notNull().default('ticket'),
    googleEventId: text('google_event_id'),
    msEventId: text('ms_event_id'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('calendar_events_tenant_user_idx').on(table.tenantId, table.userId),
    index('calendar_events_date_idx').on(table.tenantId, table.startAt),
    index('calendar_events_ticket_idx').on(table.ticketId),
  ],
);
