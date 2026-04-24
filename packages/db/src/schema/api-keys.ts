import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(), // e.g. "N-central Integration", "Harbor Phone System"
  keyHash: text('key_hash').notNull(), // bcrypt hash of the actual key
  keyPrefix: text('key_prefix').notNull(), // first 8 chars for display (e.g. "rt_abc123...")
  scopes: text('scopes').default('*'), // comma-separated: tickets:read,tickets:write,* for all
  isActive: boolean('is_active').default(true).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('api_keys_tenant_idx').on(table.tenantId),
  index('api_keys_prefix_idx').on(table.keyPrefix),
]);
