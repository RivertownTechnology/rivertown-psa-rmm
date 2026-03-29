ALTER TABLE "tenants" ADD COLUMN "default_internal_cost_cents" integer DEFAULT 7500;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "default_billable_rate_cents" integer DEFAULT 15000;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "internal_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billable_rate_cents" integer;