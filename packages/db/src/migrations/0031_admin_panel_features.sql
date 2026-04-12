-- Support for the expanded ForgePSA super-admin panel:
--   - support_tickets (inbox)
--   - tenants.feature_flags (per-tenant overrides)

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ref" text NOT NULL UNIQUE,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "user_email" text NOT NULL,
  "category" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL, -- open | replied | closed
  "email_sent" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  "closed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets"("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "support_tickets_tenant_idx" ON "support_tickets"("tenant_id");

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL;
