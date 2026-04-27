import { z } from 'zod';
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_TYPES,
  TICKET_SOURCES,
  CONTRACT_TYPES,
  CONTRACT_STATUSES,
  BILLING_CYCLES,
  QUOTE_STATUSES,
  INVOICE_STATUSES,
  CUSTOMER_STATUSES,
  ASSET_TYPES,
  ASSET_STATUSES,
  USER_ROLES,
  CONTRACT_LINE_ITEM_TYPES,
  LINE_ITEM_CATEGORIES,
  PAYMENT_METHODS,
} from '../constants/index.js';

// Common
export const uuidSchema = z.string().uuid();
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// Auth
const passwordSchema = z.string().min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/\d/, 'Password must contain a number');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().min(1).max(100),
  tenantName: z.string().min(1).max(100),
  tenantSlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
});

// Customers
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(CUSTOMER_STATUSES).default('active'),
  billingEmail: z.string().email().optional(),
  ccBillingEmail: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zip: z.string().max(20).optional(),
  website: z.string().max(200).optional(),
  notes: z.string().optional(),
  slaPolicyId: z.string().uuid().nullable().optional(),
  ncentralName: z.string().max(200).nullable().optional(),
  screenconnectCompany: z.string().max(200).nullable().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

// Contacts
export const createContactSchema = z.object({
  customerId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  jobTitle: z.string().max(100).optional(),
  isPrimary: z.boolean().default(false),
  portalEnabled: z.boolean().default(false),
});

export const updateContactSchema = createContactSchema.partial().omit({ customerId: true });

// Sites
export const createSiteSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(2).default('US'),
  timezone: z.string().default('America/New_York'),
});

export const updateSiteSchema = createSiteSchema.partial().omit({ customerId: true });

// Assets
export const createAssetSchema = z.object({
  customerId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  assetType: z.enum(ASSET_TYPES),
  name: z.string().min(1).max(200),
  serialNumber: z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  osName: z.string().max(100).optional(),
  osVersion: z.string().max(100).optional(),
  notes: z.string().optional(),
  status: z.enum(ASSET_STATUSES).default('active'),
});

export const updateAssetSchema = createAssetSchema.partial().omit({ customerId: true });

// Tickets
export const createTicketSchema = z.object({
  customerId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  subject: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(TICKET_PRIORITIES).default('medium'),
  ticketType: z.enum(TICKET_TYPES).default('incident'),
  source: z.enum(TICKET_SOURCES).default('manual'),
});

export const updateTicketSchema = z.object({
  assignedTo: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  subject: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  ticketType: z.enum(TICKET_TYPES).optional(),
  contractId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  subcategoryId: z.string().uuid().nullable().optional(),
});

export const createTicketCommentSchema = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().default(false),
});

// Time Entries
export const createTimeEntrySchema = z.object({
  ticketId: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(1).optional(),
  isBillable: z.boolean().default(false),
  rateCents: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

export const updateTimeEntrySchema = createTimeEntrySchema.partial().omit({ ticketId: true });

// Contracts
export const createContractSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  contractType: z.enum(CONTRACT_TYPES),
  status: z.enum(CONTRACT_STATUSES).default('draft'),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  billingCycle: z.enum(BILLING_CYCLES).default('monthly'),
  autoRenew: z.boolean().default(true),
  notes: z.string().optional(),
});

export const updateContractSchema = createContractSchema.partial().omit({ customerId: true });

// Quotes
export const createQuoteSchema = z.object({
  customerId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  summary: z.string().optional(),
  validUntil: z.string().date().optional(),
});

export const updateQuoteSchema = createQuoteSchema.partial().omit({ customerId: true });

// Invoices
export const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  issueDate: z.string().date(),
  dueDate: z.string().date(),
  notes: z.string().optional(),
});

// Users
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(100),
  role: z.enum(USER_ROLES).default('tech'),
});

// Contract Line Items (enhanced)
export const createLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  itemType: z.enum(CONTRACT_LINE_ITEM_TYPES),
  category: z.enum(LINE_ITEM_CATEGORIES).optional(),
  unitPriceCents: z.number().int().min(0),
  unitCostCents: z.number().int().min(0).optional(),
  quantity: z.string().default('1'),
  blockHours: z.string().optional(),
  taxable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const updateLineItemSchema = createLineItemSchema.partial();

// Service Catalog
export const createCatalogItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  proposalDescription: z.string().optional(),
  sku: z.string().max(100).optional(),
  vendor: z.string().max(200).optional(),
  category: z.enum(LINE_ITEM_CATEGORIES),
  itemType: z.enum(CONTRACT_LINE_ITEM_TYPES),
  defaultUnitCostCents: z.number().int().min(0).optional(),
  defaultUnitPriceCents: z.number().int().min(0),
  defaultBlockHours: z.string().optional(),
  pax8ProductName: z.string().optional(),
  pax8ProductId: z.string().optional(),
  pax8VendorName: z.string().optional(),
  qboItemId: z.string().optional(),
  qboIncomeAccountId: z.string().optional(),
  qboCogAccountId: z.string().optional(),
  taxable: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const updateCatalogItemSchema = createCatalogItemSchema.partial();

// Workflow Rules
export const createWorkflowRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  trigger: z.string().min(1),
  ruleType: z.enum(['instant', 'timed', 'scheduled']).default('instant'),
  conditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).default([]),
  conditionsLogic: z.object({
    logic: z.enum(['and', 'or']),
    groups: z.array(z.object({
      logic: z.enum(['and', 'or']),
      conditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })),
    })),
  }).optional(),
  actions: z.array(z.object({ type: z.string(), params: z.record(z.string(), z.unknown()).default({}) })).min(1),
  timeConfig: z.record(z.string(), z.unknown()).default({}),
  exitConditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).default([]),
  logEnabled: z.boolean().default(true),
  templateId: z.string().uuid().optional(),
  category: z.string().default('general'),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const updateWorkflowRuleSchema = createWorkflowRuleSchema.partial();

// Compliance
export const createComplianceAssessmentSchema = z.object({
  customerId: z.string().uuid(),
  frameworkId: z.string().uuid(),
  title: z.string().min(1).max(300),
  assessmentType: z.enum(['baseline', 'detailed', 'reassessment', 'remediation_check']).default('baseline'),
  dueDate: z.string().date().optional(),
});

export const createComplianceRiskSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  category: z.enum(['technical', 'operational', 'legal', 'financial', 'reputational']).optional(),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  riskResponse: z.enum(['mitigate', 'accept', 'avoid', 'transfer']).default('mitigate'),
  responseDetails: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  controlId: z.string().uuid().optional(),
  reviewDate: z.string().date().optional(),
});

export const createCompliancePoamSchema = z.object({
  customerId: z.string().uuid(),
  frameworkId: z.string().uuid(),
  finding: z.string().min(1),
  riskLevel: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  weakness: z.string().optional(),
  remediationPlan: z.string().optional(),
  scheduledStartDate: z.string().date().optional(),
  scheduledEndDate: z.string().date().optional(),
  notes: z.string().optional(),
});

export const createComplianceIncidentSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  incidentType: z.enum(['data_breach', 'unauthorized_access', 'malware', 'phishing', 'physical_security', 'policy_violation', 'system_outage', 'other']),
  severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
});
