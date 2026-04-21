-- Attachments
CREATE TABLE IF NOT EXISTS "attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_size" integer NOT NULL,
  "mime_type" text NOT NULL,
  "storage_key" text NOT NULL,
  "uploaded_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "attachments_entity_idx" ON "attachments"("entity_type", "entity_id");

-- KB Categories
CREATE TABLE IF NOT EXISTS "kb_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);

-- KB Articles
CREATE TABLE IF NOT EXISTS "kb_articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "category_id" uuid REFERENCES "kb_categories"("id"),
  "visibility" text NOT NULL DEFAULT 'internal',
  "status" text NOT NULL DEFAULT 'draft',
  "author_id" uuid REFERENCES "users"("id"),
  "view_count" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "kb_articles_tenant_idx" ON "kb_articles"("tenant_id", "status", "visibility");

-- Canned Responses
CREATE TABLE IF NOT EXISTS "canned_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "title" text NOT NULL,
  "body" text NOT NULL,
  "category" text,
  "shortcut" text,
  "is_shared" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);

-- Notifications
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "entity_type" text,
  "entity_id" uuid,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx" ON "notifications"("user_id", "is_read", "created_at" DESC);

-- Custom Field Definitions
CREATE TABLE IF NOT EXISTS "custom_field_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "entity_type" text NOT NULL,
  "field_name" text NOT NULL,
  "field_label" text NOT NULL,
  "field_type" text NOT NULL DEFAULT 'text',
  "options" jsonb,
  "required" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);

-- Custom Field Values
CREATE TABLE IF NOT EXISTS "custom_field_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "definition_id" uuid NOT NULL REFERENCES "custom_field_definitions"("id"),
  "entity_id" uuid NOT NULL,
  "value" text,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "custom_field_values_uniq" ON "custom_field_values"("definition_id", "entity_id");

-- Ticket merge support
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "merged_into_id" uuid;
