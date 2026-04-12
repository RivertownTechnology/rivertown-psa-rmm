-- Enrich signup payload: tenant type, billing model, currency, user phone.
-- Additional context fields (company size, industry, needs) live in tenants.settings
-- under the "onboarding" key — they're for analytics + tailoring, not hot-path logic.

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "company_type" text DEFAULT 'msp' NOT NULL; -- 'msp' | 'internal_it'
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "billing_model" text; -- 'per_user' | 'per_device' | 'flat_rate' | 'hybrid' | 'none'
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'USD' NOT NULL;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;

-- Back-fill existing tenants with reasonable defaults (they were implicitly MSPs).
UPDATE "tenants" SET "company_type" = 'msp' WHERE "company_type" IS NULL;
UPDATE "tenants" SET "currency" = 'USD' WHERE "currency" IS NULL;
