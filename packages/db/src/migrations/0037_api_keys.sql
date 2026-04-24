CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "scopes" text DEFAULT '*',
  "is_active" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamptz,
  "expires_at" timestamptz,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "api_keys_tenant_idx" ON "api_keys"("tenant_id");
CREATE INDEX IF NOT EXISTS "api_keys_prefix_idx" ON "api_keys"("key_prefix");
