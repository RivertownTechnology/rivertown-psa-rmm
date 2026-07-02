-- Normalize contact emails to lowercase so inbound email matching is reliable
UPDATE contacts SET email = lower(email) WHERE email <> lower(email);
