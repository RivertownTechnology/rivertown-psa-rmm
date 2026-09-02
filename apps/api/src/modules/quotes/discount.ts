/**
 * Per-line list price / savings for the quote document.
 *
 * A list price only counts as a discount when it sits above the price actually
 * being charged. Savings are computed per line (list − charged, times quantity)
 * so a multi-quantity line shows the full amount saved, not the per-unit gap.
 *
 * Returns an empty object for undiscounted lines, so spreading it leaves the
 * line item untouched and the document keeps its original layout.
 */
export function quoteLineDiscount(li: {
  listUnitPriceCents: number | null;
  unitPriceCents: number;
  quantity: string | null;
}): { listPrice?: string; lineSavings?: string } {
  if (li.listUnitPriceCents == null || li.listUnitPriceCents <= li.unitPriceCents) return {};
  const qty = parseFloat(li.quantity ?? '1') || 0;
  return {
    listPrice: (li.listUnitPriceCents / 100).toFixed(2),
    lineSavings: (((li.listUnitPriceCents - li.unitPriceCents) * qty) / 100).toFixed(2),
  };
}
