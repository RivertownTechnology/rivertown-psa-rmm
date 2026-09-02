-- Snapshot the tax basis onto each invoice at calculation time.
--
-- Tax was previously recorded only as a single tax_cents figure, with the
-- county inferred from the customer's CURRENT address. That makes county-level
-- filing impossible to reproduce: correcting a customer's address silently
-- changes which county their historical invoices appear to belong to.
--
-- These columns freeze what was actually applied, so a filing can be
-- regenerated identically months later.
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "tax_state" text,
  ADD COLUMN IF NOT EXISTS "tax_county" text,
  ADD COLUMN IF NOT EXISTS "tax_combined_rate" numeric(6,4),
  ADD COLUMN IF NOT EXISTS "tax_state_rate" numeric(6,4),
  ADD COLUMN IF NOT EXISTS "tax_county_rate" numeric(6,4),
  ADD COLUMN IF NOT EXISTS "taxable_products_cents" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "taxable_services_cents" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "exempt_cents" integer DEFAULT 0 NOT NULL;

-- Filing reports group by jurisdiction over an issue-date range.
CREATE INDEX IF NOT EXISTS "invoices_tenant_tax_jurisdiction_idx"
  ON "invoices" ("tenant_id", "tax_state", "tax_county", "issue_date");
