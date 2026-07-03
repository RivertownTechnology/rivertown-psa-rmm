/**
 * Centralized badge/status color system for the entire PSA platform.
 * Import these instead of hardcoding colors inline.
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

// ── SLA ────────────────────────────────────────────────────────────

export const SLA_COLORS = {
  healthy: 'text-emerald-500',
  warning: 'text-amber-500',
  breached: 'text-red-500',
  paused: 'text-blue-400',
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

// ── Contract Status ────────────────────────────────────────────────

export const CONTRACT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  expired: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  cancelled: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20',
  renewal: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
};

// ── Customer Status ────────────────────────────────────────────────

export const CUSTOMER_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  inactive: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20',
  prospect: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
};

// ── Compliance ─────────────────────────────────────────────────────

export const COMPLIANCE_STATUS_COLORS: Record<string, string> = {
  compliant: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  non_compliant: 'bg-red-500/10 text-red-500 border-red-500/20',
  partial: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  not_applicable: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  not_assessed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  low: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
};

// ── Workflow ───────────────────────────────────────────────────────

export const WORKFLOW_TYPE_COLORS: Record<string, string> = {
  instant: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  timed: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  scheduled: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

// ── Chart Colors (for Recharts) ────────────────────────────────────

export const CHART_COLORS = {
  primary: '#3b82f6',    // blue-500
  success: '#22c55e',    // green-500
  warning: '#f59e0b',    // amber-500
  danger: '#ef4444',     // red-500
  purple: '#8b5cf6',     // violet-500
  pink: '#ec4899',       // pink-500
  cyan: '#06b6d4',       // cyan-500
  orange: '#f97316',     // orange-500
};

export const CHART_SERIES = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.purple,
  CHART_COLORS.pink,
  CHART_COLORS.cyan,
  CHART_COLORS.orange,
];

export const CHART_SLA = [CHART_COLORS.success, CHART_COLORS.danger];

// ── Status label maps ──────────────────────────────────────────────

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', partial: 'Partial', paid: 'Paid', overdue: 'Overdue', void: 'Void',
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', active: 'Active', expired: 'Expired', cancelled: 'Cancelled', renewal: 'Renewal',
};

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  active: 'Active', inactive: 'Inactive', prospect: 'Prospect',
};

// ── Helper: Get badge class with fallback ──────────────────────────

export function statusBadgeClass(map: Record<string, string>, status: string, fallback = 'bg-gray-500/10 text-gray-500 border-gray-500/20'): string {
  return map[status] || fallback;
}

// Human-readable status label. Uses the provided label map, else title-cases the raw value.
export function formatStatus(status: string | null | undefined, labels?: Record<string, string>): string {
  if (!status) return '-';
  if (labels && labels[status]) return labels[status];
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
