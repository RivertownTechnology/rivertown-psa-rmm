CREATE TABLE "rmm_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"patch_windows" boolean DEFAULT true NOT NULL,
	"patch_third_party" boolean DEFAULT false NOT NULL,
	"auto_approve_critical" boolean DEFAULT true NOT NULL,
	"auto_approve_security" boolean DEFAULT true NOT NULL,
	"auto_approve_other" boolean DEFAULT false NOT NULL,
	"approval_delay_days" integer DEFAULT 3,
	"reboot_after_update" boolean DEFAULT true NOT NULL,
	"reboot_schedule" text DEFAULT 'maintenance_window',
	"maintenance_window_start" time,
	"maintenance_window_end" time,
	"maintenance_window_days" integer[],
	"cve_scan_enabled" boolean DEFAULT true NOT NULL,
	"cve_scan_frequency_hours" integer DEFAULT 24,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_cve_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"cve_id" text NOT NULL,
	"cvss_score" numeric,
	"severity" text,
	"title" text NOT NULL,
	"description" text,
	"affected_product" text,
	"patch_available" boolean DEFAULT false,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_edr_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"protection_status" text DEFAULT 'unknown',
	"last_scan_at" timestamp with time zone,
	"threats_found" integer DEFAULT 0,
	"definition_version" text,
	"agent_version" text,
	"raw_data" jsonb,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edr_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"api_url" text,
	"api_key_encrypted" text,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"sync_status" text DEFAULT 'idle',
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"script_content" text NOT NULL,
	"script_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"output" text,
	"exit_code" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "rmm_policy_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "rmm_policy_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "cve_risk_score" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "cve_risk_rating" text DEFAULT 'low';--> statement-breakpoint
ALTER TABLE "rmm_policies" ADD CONSTRAINT "rmm_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_cve_entries" ADD CONSTRAINT "device_cve_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_cve_entries" ADD CONSTRAINT "device_cve_entries_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_edr_status" ADD CONSTRAINT "device_edr_status_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_edr_status" ADD CONSTRAINT "device_edr_status_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edr_integrations" ADD CONSTRAINT "edr_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_executions" ADD CONSTRAINT "script_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_executions" ADD CONSTRAINT "script_executions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rmm_policies_tenant_idx" ON "rmm_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "device_cve_entries_asset_idx" ON "device_cve_entries" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "device_cve_entries_tenant_idx" ON "device_cve_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "device_edr_status_asset_idx" ON "device_edr_status" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "edr_integrations_tenant_idx" ON "edr_integrations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "script_executions_asset_idx" ON "script_executions" USING btree ("asset_id");