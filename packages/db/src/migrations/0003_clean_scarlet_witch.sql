ALTER TABLE "service_catalog_items" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "service_catalog_items" ADD COLUMN "vendor" text;--> statement-breakpoint
ALTER TABLE "service_catalog_items" ADD COLUMN "pax8_product_id" text;--> statement-breakpoint
ALTER TABLE "service_catalog_items" ADD COLUMN "pax8_vendor_name" text;--> statement-breakpoint
CREATE INDEX "service_catalog_items_sku_idx" ON "service_catalog_items" USING btree ("tenant_id","sku");