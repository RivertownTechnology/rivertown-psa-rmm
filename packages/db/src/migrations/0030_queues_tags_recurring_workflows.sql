-- Service Queues
CREATE TABLE IF NOT EXISTS "ticket_queues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "description" text,
  "color" text DEFAULT '#3b82f6',
  "is_default" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);

-- Add queue to tickets
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "queue_id" uuid;

-- Ticket Tags
CREATE TABLE IF NOT EXISTS "ticket_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "color" text DEFAULT '#6b7280',
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ticket_tag_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL REFERENCES "tickets"("id"),
  "tag_id" uuid NOT NULL REFERENCES "ticket_tags"("id"),
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_tag_assignments_uniq" ON "ticket_tag_assignments"("ticket_id", "tag_id");

-- Recurring Ticket Rules
CREATE TABLE IF NOT EXISTS "recurring_ticket_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "frequency" text NOT NULL,
  "day_of_week" integer,
  "day_of_month" integer,
  "customer_id" uuid REFERENCES "customers"("id"),
  "subject" text NOT NULL,
  "description" text,
  "priority" text DEFAULT 'medium',
  "category_id" uuid,
  "assigned_to" uuid REFERENCES "users"("id"),
  "queue_id" uuid,
  "tags" jsonb,
  "last_run_at" timestamptz,
  "next_run_at" timestamptz,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);

-- Workflow Rules
CREATE TABLE IF NOT EXISTS "workflow_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "trigger" text NOT NULL,
  "conditions" jsonb NOT NULL DEFAULT '[]',
  "actions" jsonb NOT NULL DEFAULT '[]',
  "sort_order" integer DEFAULT 0,
  "execution_count" integer DEFAULT 0,
  "last_executed_at" timestamptz,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
