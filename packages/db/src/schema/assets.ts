import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
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
    // Detailed inventory (populated by agent)
    systemInventory: jsonb('system_inventory'), // full system details as JSON
    lastInventoryAt: timestamp('last_inventory_at', { withTimezone: true }),
    notes: text('notes'),
    status: text('status').default('active').notNull(),
    rmmPolicyId: uuid('rmm_policy_id'),
    cveRiskScore: integer('cve_risk_score').default(0),
    cveRiskRating: text('cve_risk_rating').default('low'),
    agentId: uuid('agent_id'),
    meshAgentId: text('mesh_agent_id'), // MeshCentral device node ID
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('assets_tenant_customer_idx').on(table.tenantId, table.customerId),
  ],
);
