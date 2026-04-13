import { pgTable, uuid, text, timestamp, date, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
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
    // RMM integration (N-able / NinjaRMM)
    externalRmmId: text('external_rmm_id'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    // ConnectWise-style configuration fields
    warrantyExpiration: date('warranty_expiration'),
    purchaseDate: date('purchase_date'),
    vendor: text('vendor'),
    // Generic import tracking (ConnectWise / Autotask / CSV — distinct from the RMM path)
    externalId: text('external_id'),
    externalSource: text('external_source'),
    externalNumber: text('external_number'),
    customFields: jsonb('custom_fields').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('assets_tenant_customer_idx').on(table.tenantId, table.customerId),
    uniqueIndex('assets_tenant_external_uniq').on(table.tenantId, table.externalSource, table.externalId),
  ],
);
