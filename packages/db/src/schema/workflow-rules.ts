import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const workflowRules = pgTable('workflow_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  // Trigger: when does this rule fire?
  trigger: text('trigger').notNull(), // ticket_created, ticket_updated, ticket_status_changed, sla_warning, customer_reply
  // Conditions: array of {field, operator, value}
  // e.g. [{field: 'priority', operator: 'equals', value: 'critical'}, {field: 'customerId', operator: 'equals', value: 'uuid'}]
  conditions: jsonb('conditions').notNull().default('[]'),
  // Actions: array of {type, params}
  // e.g. [{type: 'assign_to', params: {userId: 'uuid'}}, {type: 'set_priority', params: {priority: 'critical'}}, {type: 'send_notification', params: {message: '...'}}]
  actions: jsonb('actions').notNull().default('[]'),
  sortOrder: integer('sort_order').default(0),
  executionCount: integer('execution_count').default(0),
  lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
