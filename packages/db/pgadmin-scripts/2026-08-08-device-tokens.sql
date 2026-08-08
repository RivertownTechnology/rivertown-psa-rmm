-- Apple Push Notifications — device_tokens table
-- Run this once, directly in pgAdmin's Query Tool, against the production database.
--
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS), so running
-- this twice does nothing the second time.
--
-- This is the ONLY schema change this feature needs. Apple Push credentials
-- (the .p8 key, Key ID, Team ID, Bundle ID) do NOT go in this script or any
-- SQL script — they're entered through Settings > Integrations > Apple Push
-- in the app, which stores them encrypted in the existing integration_configs
-- table (same table/mechanism already used for Twilio, QuickBooks, etc.).
-- Nothing to do here for that part; the settings page creates its own row on
-- first save.

CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "token" text NOT NULL UNIQUE,
  "platform" text NOT NULL,
  "bundle_id" text NOT NULL,
  "environment" text NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  "last_seen_at" timestamptz DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "device_tokens_user_idx" ON "device_tokens"("user_id");

-- Quick sanity check after running — should show the new table with 0 rows.
SELECT count(*) AS device_token_rows FROM device_tokens;
