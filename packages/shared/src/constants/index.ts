export const TICKET_STATUSES = [
  'new',
  'open',
  'pending',
  'scheduled',
  'waiting_on_customer',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_TYPES = ['incident', 'service_request', 'problem', 'change'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_SOURCES = ['manual', 'portal', 'email', 'agent_alert'] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

export const CONTRACT_TYPES = [
  'managed_services',
  'break_fix',
  'per_device',
  'per_user',
  'block_time',
  'recurring_flat',
  'ad_hoc',
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_STATUSES = ['draft', 'active', 'expired', 'cancelled'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const BILLING_CYCLES = ['monthly', 'quarterly', 'annual'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const CONTRACT_LINE_ITEM_TYPES = [
  'recurring',
  'per_device',
  'per_user',
  'block_time',
  'one_time',
] as const;
export type ContractLineItemType = (typeof CONTRACT_LINE_ITEM_TYPES)[number];

// Coverage policy is the v1 billing-behavior driver on a contract line item.
//   inclusive — covered, no balance (managed services)
//   block     — decrement balance; overage bills at overageRateCents or rejects when null
//   billable  — always bills at unitPriceCents (T&M / break-fix)
export const COVERAGE_POLICIES = ['inclusive', 'block', 'billable'] as const;
export type CoveragePolicy = (typeof COVERAGE_POLICIES)[number];

export const RESET_CADENCES = ['monthly', 'quarterly', 'annual'] as const;
export type ResetCadence = (typeof RESET_CADENCES)[number];

// Server-decided billing classification for a single time entry.
export const TIME_ENTRY_CLASSIFICATIONS = ['covered', 'billable', 'overage', 'internal'] as const;
export type TimeEntryClassification = (typeof TIME_ENTRY_CLASSIFICATIONS)[number];

// Required when classification = 'internal' (work that hits the per-tenant Internal contract).
export const INTERNAL_CATEGORIES = [
  'admin',
  'training',
  'sales',
  'rnd',
  'pto',
  'travel_unbillable',
] as const;
export type InternalCategory = (typeof INTERNAL_CATEGORIES)[number];

// Optional override that demotes a 'billable' or 'overage' entry to $0 (still cost-tracked).
// Block lines also do NOT decrement when set — the time is a freebie either way.
export const NON_BILLABLE_REASONS = ['communication', 'goodwill', 'rework', 'travel'] as const;
export type NonBillableReason = (typeof NON_BILLABLE_REASONS)[number];

export const LINE_ITEM_CATEGORIES = [
  'license',
  'security',
  'backup',
  'managed_service',
  'support_hours',
  'hardware',
  'other',
] as const;
export type LineItemCategory = (typeof LINE_ITEM_CATEGORIES)[number];

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'approved',
  'rejected',
  'converted',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const INVOICE_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'partial',
  'paid',
  'overdue',
  'void',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['stripe', 'connectbooster', 'qbo_payments', 'manual', 'check', 'ach', 'qbo'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CUSTOMER_STATUSES = ['active', 'inactive', 'prospect'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const ASSET_TYPES = [
  'workstation',
  'server',
  'laptop',
  'network_device',
  'printer',
  'mobile',
  'other',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = ['active', 'retired', 'rma'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const USER_ROLES = ['owner', 'admin', 'tech'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const INTEGRATION_PROVIDERS = [
  'pax8', 'quickbooks', 'stripe', 'connectbooster', 'qbo_payments',
  'twilio', 'google-email', 'google-calendar', 'billing-email', 'ai',
  'ninjaone', 'crewhu',
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const SYNC_STATUSES = ['idle', 'syncing', 'error'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const COMMENT_AUTHOR_TYPES = ['user', 'contact', 'system'] as const;
export type CommentAuthorType = (typeof COMMENT_AUTHOR_TYPES)[number];

export const AUDIT_ACTOR_TYPES = ['user', 'contact', 'agent', 'system'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
