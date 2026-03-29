import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    changes: jsonb('changes'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_log_tenant_entity_idx').on(table.tenantId, table.entityType, table.entityId),
    index('audit_log_created_idx').on(table.createdAt),
  ],
);

export const tenantSequences = pgTable(
  'tenant_sequences',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    sequenceName: text('sequence_name').notNull(),
    currentValue: text('current_value').default('0').notNull(),
  },
  (table) => [
    uniqueIndex('tenant_sequences_pk').on(table.tenantId, table.sequenceName),
  ],
);
