-- Add portal role and permissions to contacts
ALTER TABLE "contacts" ADD COLUMN "portal_role" text DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "portal_permissions" jsonb DEFAULT '["tickets"]';
