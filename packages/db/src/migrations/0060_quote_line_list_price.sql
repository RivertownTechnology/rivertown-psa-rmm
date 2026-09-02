-- Per-line "list price" for quotes. When set and higher than the charged
-- unit price, the quote renders the list price struck through alongside the
-- customer's price, and totals the difference as savings.
-- Nullable: a line with no list price is simply not discounted.
ALTER TABLE "quote_line_items" ADD COLUMN IF NOT EXISTS "list_unit_price_cents" integer;
