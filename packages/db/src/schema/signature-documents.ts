import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Identity documents captured during e-signing (photo ID for MSA signing).
// Stored in Postgres (base64) so no external storage dependency; one active
// document per signature request. Never rendered into customer-facing PDFs.
export const signatureDocuments = pgTable(
  'signature_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    signatureId: uuid('signature_id').notNull(),
    docType: text('doc_type').default('photo_id').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    dataBase64: text('data_base64').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('signature_documents_signature_idx').on(table.signatureId),
  ],
);
