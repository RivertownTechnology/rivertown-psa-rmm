-- Pending phone for SMS-MFA setup — the candidate number is held on the setup
-- code row and only written to contacts.portal_mfa_phone once the code is
-- verified, so a session holder can't silently redirect the live MFA phone.
ALTER TABLE "portal_mfa_codes" ADD COLUMN IF NOT EXISTS "phone" text;
