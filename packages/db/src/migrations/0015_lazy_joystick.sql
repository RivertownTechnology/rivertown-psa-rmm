CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"state" text NOT NULL,
	"county" text,
	"combined_rate" numeric(6, 4) NOT NULL,
	"state_rate" numeric(6, 4),
	"county_rate" numeric(6, 4),
	"applies_to_products" boolean DEFAULT true NOT NULL,
	"applies_to_services" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tax_rates_tenant_state_idx" ON "tax_rates" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_tenant_state_county_idx" ON "tax_rates" USING btree ("tenant_id","state","county");