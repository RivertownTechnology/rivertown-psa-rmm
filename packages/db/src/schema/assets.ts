import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { sites } from './sites.js';
import { contacts } from './contacts.js';

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    siteId: uuid('site_id').references(() => sites.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    assetType: text('asset_type').notNull(),
    name: text('name').notNull(),
    serialNumber: text('serial_number'),
    manufacturer: text('manufacturer'),
    model: text('model'),
    osName: text('os_name'),
    osVersion: text('os_version'),
    ipAddress: text('ip_address'),
    macAddress: text('mac_address'),
    notes: text('notes'),
    status: text('status').default('active').notNull(),
    // RMM integration fields
    externalRmmId: text('external_rmm_id'),
    screenconnectSessionId: text('screenconnect_session_id'),
    screenconnectOnline: boolean('screenconnect_online').default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('assets_tenant_customer_idx').on(table.tenantId, table.customerId),
  ],
);
