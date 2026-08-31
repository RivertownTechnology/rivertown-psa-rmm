-- Signer phone number captured on quote/MSA e-signature forms
ALTER TABLE "document_signatures" ADD COLUMN IF NOT EXISTS "signer_phone" text;
