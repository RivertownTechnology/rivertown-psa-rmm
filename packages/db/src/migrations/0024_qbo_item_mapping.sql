-- QuickBooks item-level accounting mapping
ALTER TABLE "service_catalog_items" ADD COLUMN "qbo_item_id" text;
ALTER TABLE "service_catalog_items" ADD COLUMN "qbo_income_account_id" text;
ALTER TABLE "service_catalog_items" ADD COLUMN "qbo_cog_account_id" text;

-- Cost tracking and catalog link on invoice line items
ALTER TABLE "invoice_line_items" ADD COLUMN "unit_cost_cents" integer;
ALTER TABLE "invoice_line_items" ADD COLUMN "catalog_item_id" uuid REFERENCES "service_catalog_items"("id");

-- Catalog link on contract line items
ALTER TABLE "contract_line_items" ADD COLUMN "catalog_item_id" uuid REFERENCES "service_catalog_items"("id");
