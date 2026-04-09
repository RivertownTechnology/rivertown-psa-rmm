CREATE TABLE "ticket_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_registrations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "patch_policies" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "patch_statuses" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rmm_policies" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device_cve_entries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device_edr_status" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device_software" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "edr_integrations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "script_executions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_releases" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_registrations" CASCADE;--> statement-breakpoint
DROP TABLE "patch_policies" CASCADE;--> statement-breakpoint
DROP TABLE "patch_statuses" CASCADE;--> statement-breakpoint
DROP TABLE "rmm_policies" CASCADE;--> statement-breakpoint
DROP TABLE "device_cve_entries" CASCADE;--> statement-breakpoint
DROP TABLE "device_edr_status" CASCADE;--> statement-breakpoint
DROP TABLE "device_software" CASCADE;--> statement-breakpoint
DROP TABLE "edr_integrations" CASCADE;--> statement-breakpoint
DROP TABLE "script_executions" CASCADE;--> statement-breakpoint
DROP TABLE "agent_releases" CASCADE;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "external_rmm_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_subcategories" ADD CONSTRAINT "ticket_subcategories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_subcategories" ADD CONSTRAINT "ticket_subcategories_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_categories_tenant_slug_idx" ON "ticket_categories" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "ticket_categories_tenant_active_idx" ON "ticket_categories" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_subcategories_tenant_cat_slug_idx" ON "ticket_subcategories" USING btree ("tenant_id","category_id","slug");--> statement-breakpoint
CREATE INDEX "ticket_subcategories_category_idx" ON "ticket_subcategories" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_subcategory_id_ticket_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."ticket_subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "system_inventory";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "last_inventory_at";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "rmm_policy_id";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "cve_risk_score";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "cve_risk_rating";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "agent_id";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "mesh_agent_id";