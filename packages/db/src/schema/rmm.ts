import { pgTable, uuid, text, boolean, integer, time, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { sites } from './sites.js';
import { assets } from './assets.js';

export const agentRegistrations = pgTable(
  'agent_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    siteId: uuid('site_id').references(() => sites.id),
    assetId: uuid('asset_id').references(() => assets.id),
    machineId: text('machine_id').notNull(),
    hostname: text('hostname').notNull(),
    agentVersion: text('agent_version').notNull(),
    osInfo: jsonb('os_info'),
    certThumbprint: text('cert_thumbprint'),
    status: text('status').default('online').notNull(),
    lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('agent_registrations_tenant_machine_idx').on(table.tenantId, table.machineId),
    index('agent_registrations_heartbeat_idx').on(table.tenantId, table.lastHeartbeat),
  ],
);

export const patchPolicies = pgTable(
  'patch_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    targetType: text('target_type').notNull(),
    targetIds: uuid('target_ids').array(),
    autoApproveCritical: boolean('auto_approve_critical').default(true).notNull(),
    autoApproveSecurity: boolean('auto_approve_security').default(true).notNull(),
    autoApproveOther: boolean('auto_approve_other').default(false).notNull(),
    approvalDelayDays: integer('approval_delay_days').default(3),
    maintenanceWindowStart: time('maintenance_window_start'),
    maintenanceWindowEnd: time('maintenance_window_end'),
    maintenanceWindowDays: integer('maintenance_window_days').array(),
    rebootPolicy: text('reboot_policy').default('if_needed'),
    isEnabled: boolean('is_enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('patch_policies_tenant_idx').on(table.tenantId),
  ],
);

export const patchStatuses = pgTable(
  'patch_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agentRegistrations.id),
    kbArticle: text('kb_article'),
    updateId: text('update_id').notNull(),
    title: text('title').notNull(),
    classification: text('classification'),
    severity: text('severity'),
    status: text('status').default('available').notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }),
    failedReason: text('failed_reason'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('patch_statuses_agent_status_idx').on(table.agentId, table.status),
  ],
);
