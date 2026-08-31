import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const documentSignatures = pgTable(
  'document_signatures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    entityType: text('entity_type').notNull(), // 'quote' | 'msa'
    entityId: uuid('entity_id').notNull(), // quotes.id or agreements.id
    token: text('token').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    status: text('status').default('pending').notNull(), // pending | viewed | signed | declined | revoked
    signerName: text('signer_name'),
    signerEmail: text('signer_email'),
    ipAddress: text('ip_address'),
    forwardedFor: text('forwarded_for'), // raw X-Forwarded-For chain as received
    userAgent: text('user_agent'),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    declineReason: text('decline_reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('document_signatures_token_idx').on(table.token),
    index('document_signatures_entity_idx').on(table.tenantId, table.entityType, table.entityId),
  ],
);
