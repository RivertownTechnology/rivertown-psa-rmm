/**
 * ConnectWise "Companies" importer.
 *
 * Default CW export headers:
 *   RecID, Lead, Company Name, Company ID, Phone Number, Territory, Type,
 *   Status, Site, Address Line 1, City, State, Sales Rep
 *
 * Mapping to our customers schema:
 *   RecID          → customers.external_id    (also external_source='connectwise')
 *   Company ID     → customers.external_number
 *   Company Name   → customers.name
 *   Phone Number   → customers.phone
 *   Address Line 1 → customers.address
 *   City           → customers.city
 *   State          → customers.state
 *   Type           → customers.customer_type
 *   Status         → customers.status (normalized to 'active' / 'inactive')
 *   Lead           → if truthy, status becomes 'lead', customer_type='lead'
 *   Territory, Site, Sales Rep → customers.custom_fields (unless mapped explicitly)
 */
import type { ParsedFile } from './parsers.js';

export interface ColumnMapping {
  // CW header name → our target. 'ignore' to skip, 'custom:<key>' to put in customFields
  [header: string]: string;
}

export const DEFAULT_COMPANY_MAPPING: ColumnMapping = {
  'RecID': 'external_id',
  'Company ID': 'external_number',
  'Company Name': 'name',
  'Phone Number': 'phone',
  'Address Line 1': 'address',
  'City': 'city',
  'State': 'state',
  'Type': 'customer_type',
  'Status': 'status',
  'Lead': 'lead_flag', // special handled below
  'Territory': 'custom:territory',
  'Site': 'custom:site',
  'Sales Rep': 'custom:sales_rep',
};

// Known/accepted target field keys
export const COMPANY_TARGET_FIELDS = [
  'ignore',
  'name',
  'status',
  'customer_type',
  'billing_email',
  'cc_billing_email',
  'phone',
  'address',
  'city',
  'state',
  'zip',
  'county',
  'website',
  'notes',
  'external_id',
  'external_number',
  'lead_flag',
  // 'custom:<key>' also accepted dynamically
] as const;

export interface PreparedRow {
  rowNumber: number;
  customer: {
    name: string;
    status: string;
    customerType: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
    website: string | null;
    billingEmail: string | null;
    ccBillingEmail: string | null;
    externalId: string | null;
    externalNumber: string | null;
    customFields: Record<string, unknown>;
  };
  warnings: string[];
}

export interface PrepareResult {
  rows: PreparedRow[];
  errors: { row: number; message: string }[];
}

function normalizeStatus(raw: unknown, isLead: boolean): string {
  if (isLead) return 'lead';
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'active';
  if (['inactive', 'disabled', 'closed', 'dead'].includes(s)) return 'inactive';
  if (['lead', 'prospect'].includes(s)) return 'lead';
  return 'active';
}

function normalizeType(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  // Common ConnectWise types — normalize loosely
  if (s.includes('lead')) return 'lead';
  if (s.includes('prospect')) return 'prospect';
  if (s.includes('client') || s.includes('customer')) return 'commercial';
  if (s.includes('residential') || s.includes('home')) return 'residential';
  if (s.includes('vendor') || s.includes('supplier')) return 'vendor';
  return String(raw).trim(); // keep unknown value as-is
}

function truthy(raw: unknown): boolean {
  if (raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'x'].includes(s);
}

/**
 * Apply the column mapping to the parsed file, producing validated rows ready
 * for insert/upsert. Returns rows + per-row errors (fatal ones that block import).
 */
export function prepareCompanyRows(
  parsed: ParsedFile,
  mapping: ColumnMapping,
): PrepareResult {
  const rows: PreparedRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (const pr of parsed.rows) {
    const row: PreparedRow = {
      rowNumber: pr.rowNumber,
      customer: {
        name: '',
        status: 'active',
        customerType: null,
        phone: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        county: null,
        website: null,
        billingEmail: null,
        ccBillingEmail: null,
        externalId: null,
        externalNumber: null,
        customFields: {},
      },
      warnings: [],
    };

    let isLead = false;
    let rawStatus: unknown = null;

    // Walk each mapped column
    for (const [header, target] of Object.entries(mapping)) {
      if (target === 'ignore') continue;
      const value = pr.data[header];
      if (value == null) continue;

      if (target.startsWith('custom:')) {
        const key = target.slice('custom:'.length);
        if (key) row.customer.customFields[key] = value;
        continue;
      }

      switch (target) {
        case 'name':        row.customer.name = String(value).trim(); break;
        case 'status':      rawStatus = value; break;
        case 'lead_flag':   if (truthy(value)) isLead = true; break;
        case 'customer_type': row.customer.customerType = normalizeType(value); break;
        case 'phone':       row.customer.phone = String(value).trim(); break;
        case 'address':     row.customer.address = String(value).trim(); break;
        case 'city':        row.customer.city = String(value).trim(); break;
        case 'state':       row.customer.state = String(value).trim(); break;
        case 'zip':         row.customer.zip = String(value).trim(); break;
        case 'county':      row.customer.county = String(value).trim(); break;
        case 'website':     row.customer.website = String(value).trim(); break;
        case 'billing_email': row.customer.billingEmail = String(value).trim().toLowerCase(); break;
        case 'cc_billing_email': row.customer.ccBillingEmail = String(value).trim().toLowerCase(); break;
        case 'notes':       /* merged into existing notes field — skip for new imports, could be handled on merge */
                            row.customer.customFields['original_notes'] = value;
                            break;
        case 'external_id': row.customer.externalId = String(value).trim(); break;
        case 'external_number': row.customer.externalNumber = String(value).trim(); break;
        default:
          row.warnings.push(`Unknown target field '${target}' for column '${header}'`);
      }
    }

    // Derive status + type now that we know the lead flag + raw status
    row.customer.status = normalizeStatus(rawStatus, isLead);
    if (isLead && !row.customer.customerType) row.customer.customerType = 'lead';

    // Validate
    if (!row.customer.name || row.customer.name.length === 0) {
      errors.push({ row: pr.rowNumber, message: 'Missing company name' });
      continue;
    }
    if (row.customer.name.length > 200) {
      errors.push({ row: pr.rowNumber, message: 'Company name exceeds 200 characters' });
      continue;
    }

    rows.push(row);
  }

  return { rows, errors };
}
