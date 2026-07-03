/**
 * Shared badge/status color system — trimmed copy of the admin app's
 * apps/web/src/lib/badge-colors.ts so the portal and admin apps use the
 * SAME tinted colors + human-readable labels for every status.
 */

// ── Ticket Status ──────────────────────────────────────────────────

export const TICKET_STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  open: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  scheduled: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  waiting_on_customer: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  resolved: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  closed: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20',
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  open: 'Open',
  pending: 'Pending',
  scheduled: 'Scheduled',
  waiting_on_customer: 'Waiting on Customer',
  resolved: 'Resolved',
  closed: 'Closed',
};

// ── Priority ───────────────────────────────────────────────────────

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
  medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  high: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

// ── Invoice Status ─────────────────────────────────────────────────

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
  sent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  partial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  overdue: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  void: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', partial: 'Partial', paid: 'Paid', overdue: 'Overdue', void: 'Void',
};

// ── Quote Status ───────────────────────────────────────────────────

export const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
  sent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  expired: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  cancelled: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20',
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', approved: 'Approved', rejected: 'Rejected', expired: 'Expired', cancelled: 'Cancelled',
};

// ── Asset Status ───────────────────────────────────────────────────

export const ASSET_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  inactive: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20',
  retired: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20',
  maintenance: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

// ── Helpers ────────────────────────────────────────────────────────

const FALLBACK = 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20';

export function statusBadgeClass(map: Record<string, string>, status: string, fallback = FALLBACK): string {
  return map[status] || fallback;
}

// Human-readable status label. Uses the provided label map, else title-cases the raw value.
export function formatStatus(status: string | null | undefined, labels?: Record<string, string>): string {
  if (!status) return '-';
  if (labels && labels[status]) return labels[status];
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
