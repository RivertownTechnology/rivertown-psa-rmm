-- Add QuickBooks Online payment ID to payments table
ALTER TABLE "payments" ADD COLUMN "qbo_payment_id" text;
