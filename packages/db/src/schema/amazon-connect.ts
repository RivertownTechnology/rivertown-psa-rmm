import { pgTable, uuid, text, boolean, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const connectCredentials = pgTable('connect_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  appleBusinessId: text('apple_business_id').notNull(),
  instanceArn: text('instance_arn').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, t => [uniqueIndex('connect_credentials_hash_idx').on(t.tokenHash), index('connect_credentials_tenant_idx').on(t.tenantId)]);

// Only staff can establish this mapping. A supplied email is never verification.
export const connectIdentities = pgTable('connect_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  appleBusinessId: text('apple_business_id').notNull(),
  appleCustomerId: text('apple_customer_id').notNull(),
  contactId: uuid('contact_id'),
  verifiedBy: uuid('verified_by'),
  verificationNote: text('verification_note'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
}, t => [uniqueIndex('connect_identity_external_idx').on(t.tenantId, t.appleBusinessId, t.appleCustomerId)]);

export const connectConversations = pgTable('connect_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  identityId: uuid('identity_id').notNull().references(() => connectIdentities.id),
  instanceArn: text('instance_arn').notNull(),
  contactId: text('contact_id').notNull(),
  state: text('state').notNull().default('bot'),
  stateAt: timestamp('state_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('connect_conversation_external_idx').on(t.tenantId, t.instanceArn, t.contactId)]);

// Intake responses and events are committed atomically with their side effects.
export const connectOperations = pgTable('connect_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  conversationId: uuid('conversation_id').notNull().references(() => connectConversations.id),
  kind: text('kind').notNull(),
  requestId: text('request_id').notNull(),
  payloadHash: text('payload_hash').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  response: jsonb('response').$type<Record<string, unknown>>().notNull(),
  ticketId: uuid('ticket_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('connect_operation_request_idx').on(t.conversationId, t.kind, t.requestId), index('connect_operation_tenant_idx').on(t.tenantId, t.kind, t.createdAt)]);
