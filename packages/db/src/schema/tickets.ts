import { pgTable, uuid, text, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { contacts } from './contacts.js';
import { assets } from './assets.js';
import { users } from './users.js';
import { ticketCategories, ticketSubcategories } from './ticket-categories.js';

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ticketNumber: integer('ticket_number').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    assetId: uuid('asset_id').references(() => assets.id),
    contractId: uuid('contract_id'),
    assignedTo: uuid('assigned_to').references(() => users.id),
    categoryId: uuid('category_id').references(() => ticketCategories.id),
    subcategoryId: uuid('subcategory_id').references(() => ticketSubcategories.id),
    subject: text('subject').notNull(),
    description: text('description'),
    status: text('status').notNull().default('new'),
    priority: text('priority').notNull().default('medium'),
    ticketType: text('ticket_type').default('incident'),
    source: text('source').default('manual'),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    slaResponseDueAt: timestamp('sla_response_due_at', { withTimezone: true }),
    slaResolutionDueAt: timestamp('sla_resolution_due_at', { withTimezone: true }),
    slaResponseMet: boolean('sla_response_met'),
    slaBreached: boolean('sla_breached').default(false),
    slaPolicyId: uuid('sla_policy_id'),
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('tickets_tenant_number_idx').on(table.tenantId, table.ticketNumber),
    index('tickets_tenant_status_idx').on(table.tenantId, table.status),
    index('tickets_tenant_customer_idx').on(table.tenantId, table.customerId),
    index('tickets_tenant_assigned_idx').on(table.tenantId, table.assignedTo),
  ],
);

export const ticketComments = pgTable(
  'ticket_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id),
    authorType: text('author_type').notNull(),
    authorId: uuid('author_id').notNull(),
    body: text('body').notNull(),
    isInternal: boolean('is_internal').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ticket_comments_ticket_idx').on(table.ticketId),
  ],
);

export const ticketTimeEntries = pgTable(
  'ticket_time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes'),
    isBillable: boolean('is_billable').default(false).notNull(),
    isBilled: boolean('is_billed').default(false).notNull(),
    invoiceLineId: uuid('invoice_line_id'),
    rateCents: integer('rate_cents'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('time_entries_ticket_idx').on(table.ticketId),
    index('time_entries_tenant_billable_idx').on(table.tenantId, table.isBillable, table.isBilled),
  ],
);
