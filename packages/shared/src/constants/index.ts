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

export const LINE_ITEM_CATEGORIES = [
  'license',
  'rmm',
  'edr_av',
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

export const PAYMENT_METHODS = ['stripe', 'manual', 'check', 'qbo'] as const;
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

export const AGENT_STATUSES = ['online', 'offline', 'maintenance'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const PATCH_STATUSES = [
  'available',
  'approved',
  'downloading',
  'installing',
  'installed',
  'failed',
  'excluded',
] as const;
export type PatchStatus = (typeof PATCH_STATUSES)[number];

export const PATCH_REBOOT_POLICIES = ['never', 'if_needed', 'always'] as const;
export type PatchRebootPolicy = (typeof PATCH_REBOOT_POLICIES)[number];

export const INTEGRATION_PROVIDERS = ['pax8', 'quickbooks', 'stripe'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const SYNC_STATUSES = ['idle', 'syncing', 'error'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const COMMENT_AUTHOR_TYPES = ['user', 'contact', 'system'] as const;
export type CommentAuthorType = (typeof COMMENT_AUTHOR_TYPES)[number];

export const AUDIT_ACTOR_TYPES = ['user', 'contact', 'agent', 'system'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
