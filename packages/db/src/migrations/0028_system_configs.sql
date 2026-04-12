-- Platform-level configuration (ForgePSA system itself, not tenant-scoped).
-- Stores Mailjet / Stripe / other system-wide credentials that the ForgePSA
-- super-admin manages from the admin dashboard. Tenants still configure their
-- own email/Stripe/etc. independently via integrationConfigs.

CREATE TABLE IF NOT EXISTS "system_configs" (
  "key" text PRIMARY KEY,
  "value" text, -- encrypted JSON when ENCRYPTION_KEY is set, plain JSON otherwise
  "description" text,
  "updated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
