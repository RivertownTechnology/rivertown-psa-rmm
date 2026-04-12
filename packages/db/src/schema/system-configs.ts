import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// Platform-level config managed by ForgePSA super-admins via /admin.
// Key examples: 'mailjet', 'stripe', 'ai'. Value is encrypted JSON (AES-256-GCM)
// when ENCRYPTION_KEY is set, falls back to plain JSON otherwise.
export const systemConfigs = pgTable('system_configs', {
  key: text('key').primaryKey(),
  value: text('value'),
  description: text('description'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
