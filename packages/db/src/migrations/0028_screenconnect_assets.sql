-- ScreenConnect integration fields
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "screenconnect_session_id" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "screenconnect_online" boolean DEFAULT false;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "screenconnect_company" text;
