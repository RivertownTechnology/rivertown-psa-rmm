import { pgTable, uuid, text, integer, boolean, timestamp, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// ── Opportunities ────────────────────────────────────────────────────

export const govOpportunities = pgTable('gov_opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  title: text('title').notNull(),
  agency: text('agency').notNull(),
  agencyType: text('agency_type').notNull().default('federal'), // federal, state, county, city
  source: text('source').default('manual'), // manual, sam_gov, email, state_portal
  samNumber: text('sam_number'),
  naicsCodes: jsonb('naics_codes'), // string array
  setAsideType: text('set_aside_type').default('none'), // sdvosb, 8a, hubzone, wosb, none, small_business
  estimatedValue: integer('estimated_value'), // cents
  contractType: text('contract_type'), // firm_fixed, time_materials, cost_plus, idiq
  submissionDeadline: timestamp('submission_deadline', { withTimezone: true }),
  questionDeadline: timestamp('question_deadline', { withTimezone: true }),
  status: text('status').notNull().default('discovered'), // discovered, qualified, in_review, in_progress, submitted, awarded, lost, no_bid
  assignedTo: uuid('assigned_to').references(() => users.id),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  incumbentInfo: text('incumbent_info'),
  competitorNotes: text('competitor_notes'),
  requiredCertifications: jsonb('required_certifications'), // string array
  tags: jsonb('tags'), // string array
  winProbability: integer('win_probability'), // 0-100
  aiAnalysis: jsonb('ai_analysis'), // structured AI output
  awardedDate: date('awarded_date'),
  awardedValue: integer('awarded_value'), // cents
  lostReason: text('lost_reason'),
  debriefNotes: text('debrief_notes'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('gov_opportunities_tenant_status_idx').on(table.tenantId, table.status),
  index('gov_opportunities_deadline_idx').on(table.submissionDeadline),
]);

// ── Activities ───────────────────────────────────────────────────────

export const govOpportunityActivities = pgTable('gov_opportunity_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  opportunityId: uuid('opportunity_id').notNull().references(() => govOpportunities.id),
  userId: uuid('user_id').references(() => users.id),
  activityType: text('activity_type').notNull(), // note, status_change, document_upload, ai_analysis, compliance_update
  description: text('description').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('gov_activities_opp_idx').on(table.opportunityId),
]);

// ── Documents ────────────────────────────────────────────────────────

export const govDocuments = pgTable('gov_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  opportunityId: uuid('opportunity_id').notNull().references(() => govOpportunities.id),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  storageKey: text('storage_key').notNull(),
  documentType: text('document_type').default('rfp'), // rfp, amendment, attachment, response, other
  aiSummary: text('ai_summary'),
  aiExtractedData: jsonb('ai_extracted_data'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('gov_documents_opp_idx').on(table.opportunityId),
]);

// ── Proposals ────────────────────────────────────────────────────────

export const govProposals = pgTable('gov_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  opportunityId: uuid('opportunity_id').notNull().references(() => govOpportunities.id),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'), // draft, in_review, final, submitted
  version: integer('version').default(1),
  templateType: text('template_type').default('federal'), // federal, state, local, custom
  sections: jsonb('sections'), // [{title, content, order, isComplete}]
  createdBy: uuid('created_by').references(() => users.id),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Compliance Items ─────────────────────────────────────────────────

export const govComplianceItems = pgTable('gov_compliance_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  opportunityId: uuid('opportunity_id').notNull().references(() => govOpportunities.id),
  requirement: text('requirement').notNull(),
  category: text('category').default('content'), // form, certification, attachment, format, content
  status: text('status').notNull().default('pending'), // pending, complete, missing, at_risk, na
  notes: text('notes'),
  dueDate: date('due_date'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('gov_compliance_opp_idx').on(table.opportunityId),
]);

// ── Document Library (Reusable Content) ──────────────────────────────

export const govDocumentLibrary = pgTable('gov_document_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  title: text('title').notNull(),
  category: text('category').notNull(), // resume, case_study, certification, boilerplate, past_performance
  content: text('content').notNull().default(''),
  tags: jsonb('tags'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  useCount: integer('use_count').default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Submissions ──────────────────────────────────────────────────────

export const govSubmissions = pgTable('gov_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  opportunityId: uuid('opportunity_id').notNull().references(() => govOpportunities.id),
  proposalId: uuid('proposal_id').references(() => govProposals.id),
  submissionMethod: text('submission_method'), // portal, email, mail, hand_delivery
  submissionDate: timestamp('submission_date', { withTimezone: true }),
  confirmationNumber: text('confirmation_number'),
  attachments: jsonb('attachments'), // [{name, storageKey}]
  notes: text('notes'),
  submittedBy: uuid('submitted_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
