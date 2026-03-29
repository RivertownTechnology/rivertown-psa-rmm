ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "mfa_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "sso_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "sso_provider" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "sso_config" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_backup_codes" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sso_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sso_subject_id" text;