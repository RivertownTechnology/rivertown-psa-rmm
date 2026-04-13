-- Extend the same import pattern (external_id + source + custom_fields + upsert safety)
-- to contacts, assets (configurations), and service_catalog_items.
-- Plus a per-tenant lookup_values table for auto-discovered dropdown values
-- (customer types, asset types, etc.) collected during imports.

-- ============ contacts ============
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "external_source" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "external_number" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;
-- Optional "department" / "mobile_phone" picked up from ConnectWise contact exports
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "mobile_phone" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "disabled" boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_tenant_external_uniq"
  ON "contacts" ("tenant_id", "external_source", "external_id")
  WHERE "external_id" IS NOT NULL;

-- ============ assets (configurations) ============
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "external_source" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "external_number" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;
-- ConnectWise configuration fields that don't cleanly fit existing columns
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "warranty_expiration" date;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "purchase_date" date;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "vendor" text;

CREATE UNIQUE INDEX IF NOT EXISTS "assets_tenant_external_uniq"
  ON "assets" ("tenant_id", "external_source", "external_id")
  WHERE "external_id" IS NOT NULL;

-- ============ service_catalog_items ============
ALTER TABLE "service_catalog_items" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "service_catalog_items" ADD COLUMN IF NOT EXISTS "external_source" text;
ALTER TABLE "service_catalog_items" ADD COLUMN IF NOT EXISTS "external_number" text;
ALTER TABLE "service_catalog_items" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "service_catalog_items_tenant_external_uniq"
  ON "service_catalog_items" ("tenant_id", "external_source", "external_id")
  WHERE "external_id" IS NOT NULL;

-- ============ tenant_lookup_values ============
-- Auto-registers distinct values seen during imports so the UI can offer dropdowns.
-- Example rows after importing ConnectWise companies:
--   (tenant_id=X, field='customer_type', value='Managed Services Client', usage_count=142)
--   (tenant_id=X, field='customer_type', value='Break-Fix', usage_count=13)
--   (tenant_id=X, field='territory', value='Southeast', usage_count=78)
CREATE TABLE IF NOT EXISTS "tenant_lookup_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,  -- 'customer' | 'contact' | 'asset' | 'catalog_item'
  "field" text NOT NULL,         -- 'customer_type' | 'status' | 'territory' | custom field key
  "value" text NOT NULL,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "source" text,                 -- 'connectwise' | 'manual' | 'csv'
  "first_seen_at" timestamptz DEFAULT NOW() NOT NULL,
  "last_seen_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_lookup_values_uniq"
  ON "tenant_lookup_values" ("tenant_id", "entity_type", "field", "value");
CREATE INDEX IF NOT EXISTS "tenant_lookup_values_tenant_idx"
  ON "tenant_lookup_values" ("tenant_id", "entity_type", "field");

-- ============ sites — also ready for configuration imports (ConnectWise exports a "Site" column per company) ============
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "external_source" text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "sites_tenant_external_uniq"
  ON "sites" ("tenant_id", "external_source", "external_id")
  WHERE "external_id" IS NOT NULL;
