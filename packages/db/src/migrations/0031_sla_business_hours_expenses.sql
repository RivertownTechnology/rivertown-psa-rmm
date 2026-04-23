-- SLA Business Hours
ALTER TABLE "sla_policies" ADD COLUMN IF NOT EXISTS "business_hours_enabled" boolean DEFAULT false;
ALTER TABLE "sla_policies" ADD COLUMN IF NOT EXISTS "business_hours_start" text DEFAULT '09:00';
ALTER TABLE "sla_policies" ADD COLUMN IF NOT EXISTS "business_hours_end" text DEFAULT '17:00';
ALTER TABLE "sla_policies" ADD COLUMN IF NOT EXISTS "business_days" text DEFAULT '1,2,3,4,5';
ALTER TABLE "sla_policies" ADD COLUMN IF NOT EXISTS "holidays" jsonb;

-- Expense tracking
CREATE TABLE IF NOT EXISTS "ticket_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "ticket_id" uuid NOT NULL REFERENCES "tickets"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "expense_type" text NOT NULL,
  "description" text,
  "amount_cents" integer NOT NULL,
  "quantity" numeric DEFAULT '1',
  "is_billable" boolean DEFAULT true NOT NULL,
  "is_billed" boolean DEFAULT false NOT NULL,
  "expense_date" date NOT NULL DEFAULT CURRENT_DATE,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ticket_expenses_ticket_idx" ON "ticket_expenses"("ticket_id");
