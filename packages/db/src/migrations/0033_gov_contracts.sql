-- Government Contracts Module

CREATE TABLE IF NOT EXISTS "gov_opportunities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "title" text NOT NULL,
  "agency" text NOT NULL,
  "agency_type" text NOT NULL DEFAULT 'federal',
  "source" text DEFAULT 'manual',
  "sam_number" text,
  "naics_codes" jsonb,
  "set_aside_type" text DEFAULT 'none',
  "estimated_value" integer,
  "contract_type" text,
  "submission_deadline" timestamptz,
  "question_deadline" timestamptz,
  "status" text NOT NULL DEFAULT 'discovered',
  "assigned_to" uuid REFERENCES "users"("id"),
  "contact_name" text,
  "contact_email" text,
  "contact_phone" text,
  "incumbent_info" text,
  "competitor_notes" text,
  "required_certifications" jsonb,
  "tags" jsonb,
  "win_probability" integer,
  "ai_analysis" jsonb,
  "awarded_date" date,
  "awarded_value" integer,
  "lost_reason" text,
  "debrief_notes" text,
  "notes" text,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "gov_opportunities_tenant_status_idx" ON "gov_opportunities"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "gov_opportunities_deadline_idx" ON "gov_opportunities"("submission_deadline");

CREATE TABLE IF NOT EXISTS "gov_opportunity_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "opportunity_id" uuid NOT NULL REFERENCES "gov_opportunities"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "activity_type" text NOT NULL,
  "description" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "gov_activities_opp_idx" ON "gov_opportunity_activities"("opportunity_id");

CREATE TABLE IF NOT EXISTS "gov_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "opportunity_id" uuid NOT NULL REFERENCES "gov_opportunities"("id"),
  "file_name" text NOT NULL,
  "file_size" integer NOT NULL,
  "mime_type" text NOT NULL,
  "storage_key" text NOT NULL,
  "document_type" text DEFAULT 'rfp',
  "ai_summary" text,
  "ai_extracted_data" jsonb,
  "uploaded_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "gov_documents_opp_idx" ON "gov_documents"("opportunity_id");

CREATE TABLE IF NOT EXISTS "gov_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "opportunity_id" uuid NOT NULL REFERENCES "gov_opportunities"("id"),
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "version" integer DEFAULT 1,
  "template_type" text DEFAULT 'federal',
  "sections" jsonb,
  "created_by" uuid REFERENCES "users"("id"),
  "reviewed_by" uuid REFERENCES "users"("id"),
  "submitted_at" timestamptz,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gov_compliance_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "opportunity_id" uuid NOT NULL REFERENCES "gov_opportunities"("id"),
  "requirement" text NOT NULL,
  "category" text DEFAULT 'content',
  "status" text NOT NULL DEFAULT 'pending',
  "notes" text,
  "due_date" date,
  "assigned_to" uuid REFERENCES "users"("id"),
  "completed_at" timestamptz,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "gov_compliance_opp_idx" ON "gov_compliance_items"("opportunity_id");

CREATE TABLE IF NOT EXISTS "gov_document_library" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "title" text NOT NULL,
  "category" text NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "tags" jsonb,
  "last_used_at" timestamptz,
  "use_count" integer DEFAULT 0,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gov_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "opportunity_id" uuid NOT NULL REFERENCES "gov_opportunities"("id"),
  "proposal_id" uuid REFERENCES "gov_proposals"("id"),
  "submission_method" text,
  "submission_date" timestamptz,
  "confirmation_number" text,
  "attachments" jsonb,
  "notes" text,
  "submitted_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
