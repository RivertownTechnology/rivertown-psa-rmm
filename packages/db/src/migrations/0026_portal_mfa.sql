-- Portal MFA (SMS via Twilio) + enforce after 3 logins without MFA/Passkey
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "portal_mfa_phone" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "portal_mfa_verified_at" timestamptz;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "portal_logins_without_mfa" integer DEFAULT 0 NOT NULL;

-- Store pending SMS codes short-term (per-contact)
CREATE TABLE IF NOT EXISTS "portal_mfa_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
  "code_hash" text NOT NULL,
  "purpose" text NOT NULL, -- 'login' | 'setup'
  "expires_at" timestamptz NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "portal_mfa_codes_contact_idx" ON "portal_mfa_codes"("contact_id", "expires_at");
