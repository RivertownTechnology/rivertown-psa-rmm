-- Quote e-signature: signature requests + agreements (MSA), quote send/view tracking
CREATE TABLE IF NOT EXISTS "document_signatures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "token" text NOT NULL,
  "recipient_email" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "signer_name" text,
  "signer_email" text,
  "ip_address" text,
  "forwarded_for" text,
  "user_agent" text,
  "viewed_at" timestamptz,
  "signed_at" timestamptz,
  "declined_at" timestamptz,
  "decline_reason" text,
  "expires_at" timestamptz,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "document_signatures_token_idx" ON "document_signatures"("token");
CREATE INDEX IF NOT EXISTS "document_signatures_entity_idx" ON "document_signatures"("tenant_id", "entity_type", "entity_id");

CREATE TABLE IF NOT EXISTS "agreements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "quote_id" uuid,
  "contract_id" uuid,
  "agreement_type" text DEFAULT 'msa' NOT NULL,
  "title" text NOT NULL,
  "content_html" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "effective_date" date,
  "sent_at" timestamptz,
  "signed_at" timestamptz,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "agreements_tenant_customer_idx" ON "agreements"("tenant_id", "customer_id");
CREATE INDEX IF NOT EXISTS "agreements_quote_idx" ON "agreements"("quote_id");

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "sent_at" timestamptz;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "last_sent_at" timestamptz;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "viewed_at" timestamptz;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "decline_reason" text;
