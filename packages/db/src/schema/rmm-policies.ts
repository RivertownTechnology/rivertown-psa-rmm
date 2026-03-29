import { pgTable, uuid, text, integer, boolean, time, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const rmmPolicies = pgTable(
  'rmm_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    patchWindows: boolean('patch_windows').default(true).notNull(),
    patchThirdParty: boolean('patch_third_party').default(false).notNull(),
    autoApproveCritical: boolean('auto_approve_critical').default(true).notNull(),
    autoApproveSecurity: boolean('auto_approve_security').default(true).notNull(),
    autoApproveOther: boolean('auto_approve_other').default(false).notNull(),
    approvalDelayDays: integer('approval_delay_days').default(3),
    rebootAfterUpdate: boolean('reboot_after_update').default(true).notNull(),
    rebootSchedule: text('reboot_schedule').default('maintenance_window'),
    maintenanceWindowStart: time('maintenance_window_start'),
    maintenanceWindowEnd: time('maintenance_window_end'),
    maintenanceWindowDays: integer('maintenance_window_days').array(),
    cveScanEnabled: boolean('cve_scan_enabled').default(true).notNull(),
    cveScanFrequencyHours: integer('cve_scan_frequency_hours').default(24),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('rmm_policies_tenant_idx').on(table.tenantId)],
);
