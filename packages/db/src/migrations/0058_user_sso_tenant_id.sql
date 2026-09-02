-- Record the Entra tenant a staff user signed in from (Microsoft SSO).
-- Nullable: only set once a user authenticates via "Sign in with Microsoft".
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sso_tenant_id" text;
