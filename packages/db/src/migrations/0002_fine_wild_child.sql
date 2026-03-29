CREATE TABLE "service_catalog_bundle_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"quantity_multiplier" numeric DEFAULT '1',
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "service_catalog_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"item_type" text NOT NULL,
	"default_unit_cost_cents" integer,
	"default_unit_price_cents" integer NOT NULL,
	"default_block_hours" numeric,
	"pax8_product_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contract_line_items" ADD COLUMN "unit_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "contract_line_items" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "contract_line_items" ADD COLUMN "sort_order" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "service_catalog_bundle_items" ADD CONSTRAINT "service_catalog_bundle_items_bundle_id_service_catalog_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."service_catalog_bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalog_bundle_items" ADD CONSTRAINT "service_catalog_bundle_items_catalog_item_id_service_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."service_catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalog_bundles" ADD CONSTRAINT "service_catalog_bundles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalog_items" ADD CONSTRAINT "service_catalog_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bundle_items_bundle_idx" ON "service_catalog_bundle_items" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "service_catalog_bundles_tenant_idx" ON "service_catalog_bundles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_catalog_items_tenant_idx" ON "service_catalog_items" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "service_catalog_items_category_idx" ON "service_catalog_items" USING btree ("tenant_id","category");