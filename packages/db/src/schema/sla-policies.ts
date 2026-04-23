import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const slaPolicies = pgTable(
  'sla_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').default(false).notNull(),
    criticalResponseMinutes: integer('critical_response_minutes').notNull().default(60),
    criticalResolutionMinutes: integer('critical_resolution_minutes').notNull().default(240),
    highResponseMinutes: integer('high_response_minutes').notNull().default(240),
    highResolutionMinutes: integer('high_resolution_minutes').notNull().default(480),
    mediumResponseMinutes: integer('medium_response_minutes').notNull().default(480),
    mediumResolutionMinutes: integer('medium_resolution_minutes').notNull().default(1440),
    lowResponseMinutes: integer('low_response_minutes').notNull().default(1440),
    lowResolutionMinutes: integer('low_resolution_minutes').notNull().default(2880),
    businessHoursEnabled: boolean('business_hours_enabled').default(false),
    businessHoursStart: text('business_hours_start').default('09:00'), // HH:MM in 24h format
    businessHoursEnd: text('business_hours_end').default('17:00'),
    businessDays: text('business_days').default('1,2,3,4,5'), // 0=Sun, 1=Mon...6=Sat, comma-separated
    holidays: jsonb('holidays'), // array of date strings ['2026-12-25', '2026-01-01']
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('sla_policies_tenant_idx').on(table.tenantId),
  ],
);
