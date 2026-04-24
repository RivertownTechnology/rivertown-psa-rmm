import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const businessDocuments = pgTable('business_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  category: text('category').notNull(), // license, registration, insurance, certification, policy, contract, tax, other
  subcategory: text('subcategory'), // e.g. "General Liability", "CJIS", "Business License", "W-9"
  description: text('description'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  storageKey: text('storage_key'),
  issuer: text('issuer'), // who issued the document
  documentNumber: text('document_number'), // license/cert number
  issueDate: text('issue_date'), // date issued
  expirationDate: text('expiration_date'), // when it expires (for alerts)
  state: text('state'), // which state (for state registrations)
  tags: text('tags'), // comma-separated tags for search
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('business_documents_tenant_idx').on(table.tenantId, table.category),
]);
