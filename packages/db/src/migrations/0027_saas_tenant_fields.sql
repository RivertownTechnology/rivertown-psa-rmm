-- SaaS tenant fields: trial tracking, Stripe subscription, plan tier, super-admin, per-tenant SSO configs

-- Trial + subscription tracking on tenants
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamptz;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "subscription_status" text DEFAULT 'trial' NOT NULL; -- trial | active | past_due | cancelled
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "plan_tier" text DEFAULT 'starter' NOT NULL; -- starter | pro | enterprise
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "past_due_at" timestamptz; -- set when a subscription billing attempt first fails; 30-day grace before lockout

-- Super-admin flag on users (for ForgePSA internal staff — not MSP-owner role)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_super_admin" boolean DEFAULT false NOT NULL;

-- Per-tenant SSO configuration
CREATE TABLE IF NOT EXISTS "tenant_sso_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider" text NOT NULL, -- 'microsoft' | 'google' | 'saml'
  "domain" text, -- email domain for auto-lookup on login
  "credentials" text, -- encrypted JSON (client_id, client_secret, etc.)
  "saml_metadata_url" text,
  "saml_certificate" text,
  "is_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tenant_sso_domain_idx" ON "tenant_sso_configs"("domain") WHERE "is_enabled" = true;
CREATE INDEX IF NOT EXISTS "tenant_sso_tenant_idx" ON "tenant_sso_configs"("tenant_id");

-- Backfill: existing tenants get a 45-day trial from now if no trial_ends_at set
-- (They're existing customers so mark them active rather than trial.)
UPDATE "tenants"
SET "subscription_status" = 'active',
    "plan_tier" = 'pro'
WHERE "trial_ends_at" IS NULL;
