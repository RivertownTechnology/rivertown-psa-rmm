-- Stripe Identity verification on e-signature requests
ALTER TABLE "document_signatures" ADD COLUMN IF NOT EXISTS "verification_session_id" text;
ALTER TABLE "document_signatures" ADD COLUMN IF NOT EXISTS "verification_status" text;
