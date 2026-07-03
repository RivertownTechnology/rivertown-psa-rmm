import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '-';
  return USD.format(cents / 100);
}

// Money alias with a clearer name for new call sites
export const formatMoney = formatCents;

// Date-only strings (e.g. "2026-07-02") are parsed as local midnight to avoid
// the UTC off-by-one that `new Date('2026-07-02')` causes.
export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d.length <= 10 ? `${d}T00:00:00` : d) : d;
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatMargin(costCents: number | null, priceCents: number): string {
  if (costCents == null || priceCents === 0) return '-';
  return `${(((priceCents - costCents) / priceCents) * 100).toFixed(1)}%`;
}

export function formatCentsShort(cents: number): string {
  if (cents >= 100000) return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `$${(cents / 100).toFixed(2)}`;
}
