CREATE TABLE IF NOT EXISTS "gov_pricing_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "opportunity_id" uuid NOT NULL REFERENCES "gov_opportunities"("id"),
  "need" text NOT NULL,
  "catalog_item_id" uuid REFERENCES "service_catalog_items"("id"),
  "catalog_item_name" text,
  "quantity" numeric DEFAULT '1',
  "unit_price_cents" integer DEFAULT 0,
  "unit_cost_cents" integer DEFAULT 0,
  "frequency" text DEFAULT 'monthly',
  "notes" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "gov_pricing_items_opp_idx" ON "gov_pricing_items"("opportunity_id");
