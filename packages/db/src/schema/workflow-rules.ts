import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { tickets } from './tickets.js';

export const workflowRules = pgTable('workflow_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),

  // Trigger: when does this rule fire?
  trigger: text('trigger').notNull(),
  // Rule type: instant (fire on trigger), timed (check periodically), scheduled (cron)
  ruleType: text('rule_type').notNull().default('instant'),
  // Category for organizing rules
  category: text('category').default('general'),

  // Conditions: legacy flat array of {field, operator, value} (AND logic)
  conditions: jsonb('conditions').notNull().default('[]'),
  // Conditions Logic: nested AND/OR groups (takes precedence over flat conditions if set)
  conditionsLogic: jsonb('conditions_logic'),

  // Actions: array of {type, params}
  actions: jsonb('actions').notNull().default('[]'),

  // Time-based config (for timed/scheduled rules)
  timeConfig: jsonb('time_config').default('{}'),
  // Exit conditions: conditions that stop timed rules from re-executing (OR semantics)
  exitConditions: jsonb('exit_conditions').default('[]'),

  // Email template reference for send actions
  templateId: uuid('template_id'),
  // Whether to log each execution
  logEnabled: boolean('log_enabled').default(true).notNull(),
  // Prebuilt template flag (not a real rule until imported)
  isTemplate: boolean('is_template').default(false).notNull(),

  sortOrder: integer('sort_order').default(0),
  executionCount: integer('execution_count').default(0),
  lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('workflow_rules_type_active_idx').on(table.ruleType, table.isActive),
  index('workflow_rules_tenant_category_idx').on(table.tenantId, table.category),
]);

// ── Execution Log ──────────────────────────────────────────────────

export const workflowExecutionLog = pgTable('workflow_execution_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ruleId: uuid('rule_id').notNull().references(() => workflowRules.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  trigger: text('trigger').notNull(),
  conditionsMatched: boolean('conditions_matched').notNull().default(false),
  actionsExecuted: jsonb('actions_executed').default('[]'),
  success: boolean('success').notNull().default(true),
  error: text('error'),
  executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('wf_exec_log_tenant_idx').on(table.tenantId),
  index('wf_exec_log_rule_idx').on(table.ruleId),
  index('wf_exec_log_ticket_idx').on(table.ticketId),
  index('wf_exec_log_executed_idx').on(table.executedAt),
]);

// ── Per-Ticket Execution Tracker (prevents duplicate timed firings) ─

export const workflowTicketExecutions = pgTable('workflow_ticket_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ruleId: uuid('rule_id').notNull().references(() => workflowRules.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  executionCount: integer('execution_count').default(0).notNull(),
  lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),
  suppressed: boolean('suppressed').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('wf_ticket_exec_uniq').on(table.ruleId, table.ticketId),
  index('wf_ticket_exec_tenant_idx').on(table.tenantId),
]);
