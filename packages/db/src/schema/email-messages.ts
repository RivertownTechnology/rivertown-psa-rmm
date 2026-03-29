import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { tickets } from './tickets.js';
import { contacts } from './contacts.js';

export const emailMessages = pgTable(
  'email_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    messageId: text('message_id'),
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name'),
    toAddress: text('to_address').notNull(),
    subject: text('subject').notNull(),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    ticketId: uuid('ticket_id').references(() => tickets.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    direction: text('direction').notNull().default('inbound'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('email_messages_tenant_idx').on(table.tenantId),
    index('email_messages_ticket_idx').on(table.ticketId),
    uniqueIndex('email_messages_message_id_idx').on(table.tenantId, table.messageId),
  ],
);
