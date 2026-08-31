-- Photo ID capture during MSA e-signing
CREATE TABLE IF NOT EXISTS "signature_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "signature_id" uuid NOT NULL,
  "doc_type" text DEFAULT 'photo_id' NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" integer NOT NULL,
  "data_base64" text NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "signature_documents_signature_idx" ON "signature_documents"("signature_id");
