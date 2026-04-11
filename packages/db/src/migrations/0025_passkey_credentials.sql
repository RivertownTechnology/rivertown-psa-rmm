-- Passkey (WebAuthn) credentials for customer portal authentication
CREATE TABLE IF NOT EXISTS "passkey_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
  "credential_id" text NOT NULL,
  "public_key" text NOT NULL,
  "counter" integer NOT NULL DEFAULT 0,
  "device_type" text,
  "backed_up" boolean DEFAULT false,
  "transports" text,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "passkey_cred_id_idx" ON "passkey_credentials"("credential_id");
