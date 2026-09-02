-- Per-user Microsoft 365 (Outlook) Calendar sync for dispatch events.
-- Mirrors the Google Calendar columns; delegated Graph Calendars.ReadWrite tokens.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ms_calendar_connected" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ms_calendar_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ms_calendar_refresh_token" text;

-- Track the created Outlook event id so updates/deletes target the same event.
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "ms_event_id" text;
