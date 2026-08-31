-- Internal cost tracking on quote line items (staff-only margin visibility)
ALTER TABLE "quote_line_items" ADD COLUMN IF NOT EXISTS "unit_cost_cents" integer;
ALTER TABLE "quote_line_items" ADD COLUMN IF NOT EXISTS "catalog_item_id" uuid;
