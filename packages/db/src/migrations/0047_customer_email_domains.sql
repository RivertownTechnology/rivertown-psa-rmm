-- Email domain matching: inbound email from these domains auto-matches the customer
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_domains TEXT[] DEFAULT '{}';
