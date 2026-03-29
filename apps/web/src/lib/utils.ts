import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '-';
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatMargin(costCents: number | null, priceCents: number): string {
  if (costCents == null || priceCents === 0) return '-';
  return `${(((priceCents - costCents) / priceCents) * 100).toFixed(1)}%`;
}

export function formatCentsShort(cents: number): string {
  if (cents >= 100000) return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `$${(cents / 100).toFixed(2)}`;
}
