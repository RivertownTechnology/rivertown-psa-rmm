-- Proposal versioning and locking
ALTER TABLE gov_proposals ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE gov_proposals ADD COLUMN IF NOT EXISTS cloned_from_id UUID;
