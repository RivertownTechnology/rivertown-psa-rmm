-- MSA yearly renewal cycle + version chain
ALTER TABLE "agreements" ADD COLUMN IF NOT EXISTS "expires_at" date;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN IF NOT EXISTS "previous_agreement_id" uuid;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN IF NOT EXISTS "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN IF NOT EXISTS "renewal_notice_at" timestamp with time zone;--> statement-breakpoint
-- Existing signed MSAs enter the yearly cycle from their signing date
UPDATE "agreements" SET "expires_at" = ("signed_at" + interval '1 year')::date
WHERE "status" = 'signed' AND "signed_at" IS NOT NULL AND "expires_at" IS NULL;
