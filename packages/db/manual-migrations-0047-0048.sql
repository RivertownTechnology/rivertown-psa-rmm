-- ============================================================================
-- Manual migration bundle: 0047 + 0048
-- Safe to run directly against the database (Railway console / psql).
-- Idempotent — re-running is harmless. Wrapped in a transaction.
--
-- Covers:
--   0047_customer_email_domains  — domain→customer email matching
--   0048_lowercase_contact_emails — normalize existing contact emails
--
-- NOTE: this does NOT update Drizzle's migration journal. If you later run
-- `pnpm db:migrate` against the same DB, the `IF NOT EXISTS` / conditional
-- guards mean these statements simply no-op.
-- ============================================================================

BEGIN;

-- 0047: inbound email from these domains auto-matches the customer
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_domains TEXT[] DEFAULT '{}';

-- 0048: normalize contact emails to lowercase so inbound matching is reliable
UPDATE contacts SET email = lower(email) WHERE email <> lower(email);

COMMIT;
