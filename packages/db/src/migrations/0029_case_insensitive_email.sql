-- Enforce case-insensitive uniqueness on user email at the DB level.
-- Complements the lower() check in the signup endpoint.
-- Uses IF NOT EXISTS so re-runs are safe.

-- First: normalize any existing mixed-case emails to lowercase.
-- If two users in the same tenant collide after lowercasing, this UPDATE will fail
-- on the existing tenant_email unique index — that's fine, you'd want to know.
UPDATE "users"
SET "email" = lower("email")
WHERE "email" <> lower("email");

-- Then: add a case-insensitive global unique index on the email column.
-- We keep the existing (tenant_id, email) index for fast lookups; this adds
-- a global guarantee that no two accounts anywhere share an email.
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_uniq"
  ON "users" (lower("email"));
