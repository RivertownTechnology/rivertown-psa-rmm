CREATE TABLE IF NOT EXISTS "business_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "category" text NOT NULL,
  "subcategory" text,
  "description" text,
  "file_name" text,
  "file_size" integer,
  "mime_type" text,
  "storage_key" text,
  "issuer" text,
  "document_number" text,
  "issue_date" text,
  "expiration_date" text,
  "state" text,
  "tags" text,
  "uploaded_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "business_documents_tenant_idx" ON "business_documents"("tenant_id", "category");
