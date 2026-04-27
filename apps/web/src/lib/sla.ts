/**
 * Shared SLA countdown and formatting utilities.
 * Used by ticket list, ticket detail, and any page showing SLA status.
 */

import { SLA_COLORS } from './badge-colors';

export interface SLATicketFields {
  status: string;
  slaBreached?: boolean;
  slaResolutionDueAt?: string | null;
  slaResponseDueAt?: string | null;
  slaPausedAt?: string | null;
  slaTotalPausedMs?: number | null;
  createdAt: string;
}

export interface SLAResult {
  text: string;
  className: string;
  state: 'breached' | 'paused' | 'warning' | 'healthy' | 'met';
  remainingMs?: number;
}

/**
 * Calculate SLA countdown for display on ticket list/cards.
 * Returns null if no SLA is configured.
 */
export function slaCountdown(ticket: SLATicketFields): SLAResult | null {
  if (ticket.slaBreached) {
    return { text: 'SLA: Breached', className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', state: 'breached' };
  }

  if (!ticket.slaResolutionDueAt) return null;

  if (['resolved', 'closed'].includes(ticket.status)) {
    return { text: 'SLA: Met', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', state: 'met' };
  }

  const now = Date.now();
  const due = new Date(ticket.slaResolutionDueAt).getTime();
  const isPaused = ticket.status === 'waiting_on_customer' && !!ticket.slaPausedAt;

  // Account for paused time
  const totalPaused = (ticket.slaTotalPausedMs ?? 0) +
    (ticket.slaPausedAt ? (now - new Date(ticket.slaPausedAt).getTime()) : 0);
  const adjustedDue = due + totalPaused;
  const remaining = adjustedDue - now;

  if (remaining <= 0 && !isPaused) {
    return { text: 'SLA: Breached', className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', state: 'breached', remainingMs: remaining };
  }

  if (isPaused) {
    const label = formatDuration(remaining);
    return { text: `SLA: Paused (${label})`, className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20', state: 'paused', remainingMs: remaining };
  }

  const total = adjustedDue - new Date(ticket.createdAt).getTime();
  const atRisk = remaining < total * 0.25;
  const label = formatDuration(remaining);

  if (atRisk) {
    return { text: `SLA: ${label}`, className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', state: 'warning', remainingMs: remaining };
  }

  return { text: `SLA: ${label}`, className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', state: 'healthy', remainingMs: remaining };
}

/**
 * Format milliseconds into a human-readable duration.
 */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(Math.abs(ms) / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/**
 * Get SLA color class based on state (for use with icons, text, etc.)
 */
export function slaStateColor(state: SLAResult['state']): string {
  switch (state) {
    case 'breached': return SLA_COLORS.breached;
    case 'warning': return SLA_COLORS.warning;
    case 'paused': return SLA_COLORS.paused;
    case 'met':
    case 'healthy': return SLA_COLORS.healthy;
    default: return '';
  }
}
