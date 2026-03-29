CREATE TABLE "sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"critical_response_minutes" integer DEFAULT 60 NOT NULL,
	"critical_resolution_minutes" integer DEFAULT 240 NOT NULL,
	"high_response_minutes" integer DEFAULT 240 NOT NULL,
	"high_resolution_minutes" integer DEFAULT 480 NOT NULL,
	"medium_response_minutes" integer DEFAULT 480 NOT NULL,
	"medium_resolution_minutes" integer DEFAULT 1440 NOT NULL,
	"low_response_minutes" integer DEFAULT 1440 NOT NULL,
	"low_resolution_minutes" integer DEFAULT 2880 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "sla_policy_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_response_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_resolution_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_response_met" boolean;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_breached" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_policy_id" uuid;--> statement-breakpoint
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sla_policies_tenant_idx" ON "sla_policies" USING btree ("tenant_id");