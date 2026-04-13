-- External-source tracking on customers (for ConnectWise / Autotask / Halo imports).
-- Plus tenant-defined custom fields — extensible per tenant without schema changes.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "external_source" text; -- 'connectwise' | 'autotask' | 'halopsa' | 'csv'
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "external_number" text; -- human-readable id from source (ConnectWise "Company ID")
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_type" text; -- 'commercial' | 'residential' | 'lead' | 'prospect' | custom
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- Unique per tenant so re-imports update instead of duplicating
CREATE UNIQUE INDEX IF NOT EXISTS "customers_tenant_external_uniq"
  ON "customers" ("tenant_id", "external_source", "external_id")
  WHERE "external_id" IS NOT NULL;

-- Per-tenant custom field definitions (reusable for customers, contacts, configurations, catalog items)
CREATE TABLE IF NOT EXISTS "tenant_custom_field_defs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL, -- 'customer' | 'contact' | 'configuration' | 'catalog_item'
  "field_key" text NOT NULL,   -- snake_case identifier stored in the jsonb
  "label" text NOT NULL,       -- display name
  "field_type" text NOT NULL DEFAULT 'text', -- 'text' | 'number' | 'date' | 'boolean' | 'select'
  "options" jsonb,             -- for 'select' type: { choices: ["A","B","C"] }
  "display_order" integer DEFAULT 0 NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "custom_field_defs_tenant_entity_key_uniq"
  ON "tenant_custom_field_defs" ("tenant_id", "entity_type", "field_key");
CREATE INDEX IF NOT EXISTS "custom_field_defs_tenant_entity_idx"
  ON "tenant_custom_field_defs" ("tenant_id", "entity_type");

-- Audit trail of import jobs
CREATE TABLE IF NOT EXISTS "import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "source" text NOT NULL,       -- 'connectwise' | 'autotask' | 'halopsa' | 'csv'
  "entity_type" text NOT NULL,  -- 'customer' | 'contact' | 'configuration' | 'catalog_item'
  "status" text NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
  "total_rows" integer DEFAULT 0 NOT NULL,
  "imported_rows" integer DEFAULT 0 NOT NULL,
  "updated_rows" integer DEFAULT 0 NOT NULL,
  "failed_rows" integer DEFAULT 0 NOT NULL,
  "errors" jsonb DEFAULT '[]'::jsonb NOT NULL, -- [{ row: N, message: "..." }]
  "started_at" timestamptz DEFAULT NOW() NOT NULL,
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "import_jobs_tenant_idx" ON "import_jobs" ("tenant_id", "started_at" DESC);
