-- Rename M365 calendar columns to Google Calendar
ALTER TABLE "users" RENAME COLUMN "m365_calendar_connected" TO "google_calendar_connected";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "m365_calendar_token" TO "google_calendar_token";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "m365_calendar_refresh_token" TO "google_calendar_refresh_token";--> statement-breakpoint
ALTER TABLE "calendar_events" RENAME COLUMN "m365_event_id" TO "google_event_id";
