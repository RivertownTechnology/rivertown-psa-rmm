CREATE TABLE "agent_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"platform" text DEFAULT 'win-x64' NOT NULL,
	"sha256" text,
	"file_size" integer,
	"file_name" text NOT NULL,
	"release_notes" text,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_releases_version_platform_idx" ON "agent_releases" USING btree ("version","platform");