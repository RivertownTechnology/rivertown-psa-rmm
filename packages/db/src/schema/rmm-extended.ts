import { pgTable, uuid, text, integer, numeric, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { assets } from './assets.js';

export const deviceCveEntries = pgTable(
  'device_cve_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    assetId: uuid('asset_id').notNull().references(() => assets.id),
    cveId: text('cve_id').notNull(),
    cvssScore: numeric('cvss_score'),
    severity: text('severity'),
    title: text('title').notNull(),
    description: text('description'),
    affectedProduct: text('affected_product'),
    patchAvailable: boolean('patch_available').default(false),
    detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('device_cve_entries_asset_idx').on(table.assetId),
    index('device_cve_entries_tenant_idx').on(table.tenantId),
  ],
);

export const scriptExecutions = pgTable(
  'script_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    assetId: uuid('asset_id').notNull().references(() => assets.id),
    scriptContent: text('script_content').notNull(),
    scriptName: text('script_name'),
    status: text('status').default('pending').notNull(),
    output: text('output'),
    exitCode: integer('exit_code'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('script_executions_asset_idx').on(table.assetId)],
);

export const edrIntegrations = pgTable(
  'edr_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    provider: text('provider').notNull(),
    apiUrl: text('api_url'),
    apiKeyEncrypted: text('api_key_encrypted'),
    isEnabled: boolean('is_enabled').default(false).notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    syncStatus: text('sync_status').default('idle'),
    settings: jsonb('settings').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('edr_integrations_tenant_idx').on(table.tenantId)],
);

export const deviceEdrStatus = pgTable(
  'device_edr_status',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    assetId: uuid('asset_id').notNull().references(() => assets.id),
    provider: text('provider').notNull(),
    protectionStatus: text('protection_status').default('unknown'),
    lastScanAt: timestamp('last_scan_at', { withTimezone: true }),
    threatsFound: integer('threats_found').default(0),
    definitionVersion: text('definition_version'),
    agentVersion: text('agent_version'),
    rawData: jsonb('raw_data'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('device_edr_status_asset_idx').on(table.assetId)],
);

export const deviceSoftware = pgTable(
  'device_software',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    assetId: uuid('asset_id').notNull().references(() => assets.id),
    name: text('name').notNull(),
    version: text('version'),
    publisher: text('publisher'),
    installDate: text('install_date'),
    size: text('size'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('device_software_asset_idx').on(table.assetId),
  ],
);
