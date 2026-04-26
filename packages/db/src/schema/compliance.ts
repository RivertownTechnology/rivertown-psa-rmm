import { pgTable, uuid, text, integer, boolean, timestamp, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { users } from './users.js';
import { contacts } from './contacts.js';
import { assets } from './assets.js';
import { tickets } from './tickets.js';

// ── Frameworks (Standards Library) ──────────────────────────────────

export const complianceFrameworks = pgTable('compliance_frameworks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  version: text('version'),
  description: text('description'),
  source: text('source').default('built_in').notNull(), // built_in, custom
  isActive: boolean('is_active').default(true).notNull(),
  nistMappingEnabled: boolean('nist_mapping_enabled').default(false),
  metadata: jsonb('metadata'), // { publisher, url, effectiveDate, ... }
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_frameworks_tenant_idx').on(table.tenantId, table.isActive),
]);

// ── Policy Areas (Domains within a framework) ──────────────────────

export const compliancePolicyAreas = pgTable('compliance_policy_areas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  frameworkId: uuid('framework_id').notNull().references(() => complianceFrameworks.id),
  code: text('code').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_policy_areas_framework_idx').on(table.frameworkId),
]);

// ── Controls (Requirements within a policy area) ───────────────────

export const complianceControls = pgTable('compliance_controls', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  frameworkId: uuid('framework_id').notNull().references(() => complianceFrameworks.id),
  policyAreaId: uuid('policy_area_id').notNull().references(() => compliancePolicyAreas.id),
  controlCode: text('control_code').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  guidance: text('guidance'),
  nistMapping: text('nist_mapping'), // NIST 800-53 control ID
  severity: text('severity').default('medium'), // critical, high, medium, low
  controlType: text('control_type').default('technical'), // technical, administrative, physical
  assessmentMethod: text('assessment_method').default('examine'), // examine, interview, test
  automationSource: text('automation_source'), // null=manual, ncentral, huntress, nodeware, sentinelone, duo, m365, asset_data
  automationCheck: text('automation_check'), // machine-readable check key e.g. 'patch_compliance', 'edr_active', 'mfa_enrolled'
  sortOrder: integer('sort_order').default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_controls_framework_idx').on(table.frameworkId, table.policyAreaId),
  index('compliance_controls_nist_idx').on(table.tenantId, table.nistMapping),
]);

// ── Customer Scopes ────────────────────────────────────────────────

export const complianceCustomerScopes = pgTable('compliance_customer_scopes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  frameworkId: uuid('framework_id').notNull().references(() => complianceFrameworks.id),
  scopeSource: text('scope_source').default('manual'), // manual, contract
  status: text('status').default('active'), // active, paused, completed
  effectiveDate: date('effective_date'),
  reviewDate: date('review_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_scopes_tenant_customer_idx').on(table.tenantId, table.customerId),
  uniqueIndex('compliance_scopes_unique_idx').on(table.customerId, table.frameworkId),
]);

// ── Assessments ────────────────────────────────────────────────────

export const complianceAssessments = pgTable('compliance_assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  frameworkId: uuid('framework_id').notNull().references(() => complianceFrameworks.id),
  title: text('title').notNull(),
  assessmentType: text('assessment_type').default('baseline'), // baseline, detailed, reassessment, remediation_check
  status: text('status').default('draft'), // draft, in_progress, in_review, completed
  assessorId: uuid('assessor_id').references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  dueDate: date('due_date'),
  overallScore: integer('overall_score'), // 0-100
  summary: text('summary'),
  findings: text('findings'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_assessments_tenant_customer_idx').on(table.tenantId, table.customerId),
  index('compliance_assessments_status_idx').on(table.tenantId, table.status),
]);

// ── Assessment Items (per-control results) ─────────────────────────

export const complianceAssessmentItems = pgTable('compliance_assessment_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  assessmentId: uuid('assessment_id').notNull().references(() => complianceAssessments.id),
  controlId: uuid('control_id').notNull().references(() => complianceControls.id),
  status: text('status').default('not_assessed'), // compliant, non_compliant, partial, not_applicable, not_assessed
  notes: text('notes'),
  findings: text('findings'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  assignedToContact: uuid('assigned_to_contact').references(() => contacts.id), // customer-side assignee for portal tasks
  responseFromContact: text('response_from_contact'), // customer's answer/attestation
  responseDate: timestamp('response_date', { withTimezone: true }),
  questionForContact: text('question_for_contact'), // what to ask the customer
  dueDate: date('due_date'),
  lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_assessment_items_assessment_idx').on(table.assessmentId),
  index('compliance_assessment_items_status_idx').on(table.assessmentId, table.status),
]);

// ── Control Statuses (live per-customer tracking) ──────────────────

export const complianceControlStatuses = pgTable('compliance_control_statuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  frameworkId: uuid('framework_id').notNull().references(() => complianceFrameworks.id),
  controlId: uuid('control_id').notNull().references(() => complianceControls.id),
  status: text('status').default('not_assessed'), // compliant, non_compliant, partial, not_applicable, not_assessed
  notes: text('notes'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  assignedToContact: uuid('assigned_to_contact').references(() => contacts.id),
  dueDate: date('due_date'),
  lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
  lastAssessmentItemId: uuid('last_assessment_item_id'),
  lastAutoCheckId: uuid('last_auto_check_id'), // most recent automated check result
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_control_statuses_customer_idx').on(table.tenantId, table.customerId, table.frameworkId),
  uniqueIndex('compliance_control_statuses_unique_idx').on(table.customerId, table.controlId),
]);

// ── Control ↔ Asset links ──────────────────────────────────────────

export const complianceControlAssets = pgTable('compliance_control_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  controlStatusId: uuid('control_status_id').notNull().references(() => complianceControlStatuses.id),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
}, (table) => [
  uniqueIndex('compliance_control_assets_unique_idx').on(table.controlStatusId, table.assetId),
]);

// ── Control ↔ Ticket links ────────────────────────────────────────

export const complianceControlTickets = pgTable('compliance_control_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  controlStatusId: uuid('control_status_id').notNull().references(() => complianceControlStatuses.id),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id),
}, (table) => [
  uniqueIndex('compliance_control_tickets_unique_idx').on(table.controlStatusId, table.ticketId),
]);

// ── Evidence Repository ────────────────────────────────────────────

export const complianceEvidence = pgTable('compliance_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  title: text('title').notNull(),
  evidenceType: text('evidence_type').notNull(), // document, screenshot, config_export, log, attestation, link
  description: text('description'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  storageKey: text('storage_key'),
  externalUrl: text('external_url'),
  collectedAt: timestamp('collected_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  uploadedByContact: uuid('uploaded_by_contact').references(() => contacts.id),
  tags: jsonb('tags'), // string[]
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_evidence_customer_idx').on(table.tenantId, table.customerId),
]);

// ── Evidence ↔ Control links ──────────────────────────────────────

export const complianceEvidenceControls = pgTable('compliance_evidence_controls', {
  id: uuid('id').primaryKey().defaultRandom(),
  evidenceId: uuid('evidence_id').notNull().references(() => complianceEvidence.id),
  controlStatusId: uuid('control_status_id').notNull().references(() => complianceControlStatuses.id),
  assessmentItemId: uuid('assessment_item_id').references(() => complianceAssessmentItems.id),
}, (table) => [
  uniqueIndex('compliance_evidence_controls_unique_idx').on(table.evidenceId, table.controlStatusId),
]);

// ── POA&M Items ────────────────────────────────────────────────────

export const compliancePoamItems = pgTable('compliance_poam_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  frameworkId: uuid('framework_id').notNull().references(() => complianceFrameworks.id),
  controlId: uuid('control_id').references(() => complianceControls.id),
  assessmentId: uuid('assessment_id').references(() => complianceAssessments.id),
  poamNumber: integer('poam_number').notNull(),
  finding: text('finding').notNull(),
  riskLevel: text('risk_level').default('medium'), // critical, high, medium, low
  weakness: text('weakness'),
  remediationPlan: text('remediation_plan'),
  responsibleParty: uuid('responsible_party').references(() => users.id),
  scheduledStartDate: date('scheduled_start_date'),
  scheduledEndDate: date('scheduled_end_date'),
  actualEndDate: date('actual_end_date'),
  milestones: jsonb('milestones'), // [{title, dueDate, status, completedAt}]
  status: text('status').default('open'), // open, in_progress, delayed, completed, accepted_risk
  ticketId: uuid('ticket_id').references(() => tickets.id),
  costEstimateCents: integer('cost_estimate_cents'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_poam_customer_idx').on(table.tenantId, table.customerId),
  index('compliance_poam_status_idx').on(table.tenantId, table.status),
]);

// ── Risk Register ──────────────────────────────────────────────────

export const complianceRiskItems = pgTable('compliance_risk_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category'), // technical, operational, legal, financial, reputational
  riskSource: text('risk_source'), // assessment, audit, incident, manual
  likelihood: integer('likelihood').notNull(), // 1-5
  impact: integer('impact').notNull(), // 1-5
  riskScore: integer('risk_score').notNull(), // likelihood * impact
  riskResponse: text('risk_response').default('mitigate'), // mitigate, accept, avoid, transfer
  responseDetails: text('response_details'),
  status: text('status').default('open'), // open, mitigating, accepted, closed
  ownerId: uuid('owner_id').references(() => users.id),
  controlId: uuid('control_id').references(() => complianceControls.id),
  poamId: uuid('poam_id').references(() => compliancePoamItems.id),
  reviewDate: date('review_date'),
  lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_risk_customer_idx').on(table.tenantId, table.customerId),
  index('compliance_risk_status_idx').on(table.tenantId, table.status),
]);

// ── Policies ───────────────────────────────────────────────────────

export const compliancePolicies = pgTable('compliance_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').references(() => customers.id), // null = template
  frameworkId: uuid('framework_id').references(() => complianceFrameworks.id),
  title: text('title').notNull(),
  policyType: text('policy_type').notNull(), // policy, procedure, standard, guideline
  content: text('content'),
  version: integer('version').default(1),
  status: text('status').default('draft'), // draft, in_review, approved, published, retired
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  effectiveDate: date('effective_date'),
  reviewDate: date('review_date'),
  aiGenerated: boolean('ai_generated').default(false),
  controlIds: jsonb('control_ids'), // string[]
  tags: jsonb('tags'), // string[]
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_policies_tenant_idx').on(table.tenantId, table.customerId),
  index('compliance_policies_status_idx').on(table.tenantId, table.status),
]);

// ── Policy Versions ────────────────────────────────────────────────

export const compliancePolicyVersions = pgTable('compliance_policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  policyId: uuid('policy_id').notNull().references(() => compliancePolicies.id),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  changedBy: uuid('changed_by').references(() => users.id),
  changeNotes: text('change_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_policy_versions_idx').on(table.policyId),
]);

// ── Activity Log ───────────────────────────────────────────────────

export const complianceActivityLog = pgTable('compliance_activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').references(() => customers.id),
  entityType: text('entity_type').notNull(), // assessment, control, evidence, poam, risk, policy, framework
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(), // created, updated, status_changed, evidence_attached, reviewed, completed
  actorType: text('actor_type').notNull(), // user, contact, system
  actorId: uuid('actor_id').notNull(),
  description: text('description'),
  changes: jsonb('changes'), // { field: { old, new } }
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_activity_entity_idx').on(table.tenantId, table.entityType, table.entityId),
  index('compliance_activity_customer_idx').on(table.tenantId, table.customerId),
]);

// ── Automated Compliance Checks (integration data) ─────────────────

export const complianceAutomatedChecks = pgTable('compliance_automated_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  controlStatusId: uuid('control_status_id').references(() => complianceControlStatuses.id),
  source: text('source').notNull(), // ncentral, huntress, nodeware, sentinelone, duo, m365, asset_data
  checkType: text('check_type').notNull(), // patch_compliance, edr_active, mfa_enrolled, vuln_scan, av_status, encryption, backup_status, etc.
  result: text('result').notNull(), // pass, fail, partial, error, unknown
  details: jsonb('details'), // { totalDevices, compliantDevices, failedDevices: [...], scanDate, ... }
  assetId: uuid('asset_id').references(() => assets.id), // null for org-wide checks, set for per-device
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // when this check result goes stale
  rawData: jsonb('raw_data'), // raw API response for audit trail
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('compliance_auto_checks_customer_idx').on(table.tenantId, table.customerId),
  index('compliance_auto_checks_source_idx').on(table.tenantId, table.source, table.checkType),
  index('compliance_auto_checks_control_idx').on(table.controlStatusId),
]);
