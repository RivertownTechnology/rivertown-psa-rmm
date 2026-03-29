CREATE TABLE "device_software" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"publisher" text,
	"install_date" text,
	"size" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "system_inventory" jsonb;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "last_inventory_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_software" ADD CONSTRAINT "device_software_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_software" ADD CONSTRAINT "device_software_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_software_asset_idx" ON "device_software" USING btree ("asset_id");