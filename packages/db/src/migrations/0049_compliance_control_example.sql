-- Add example column to compliance_controls for per-control example evidence / model assessment notes
ALTER TABLE compliance_controls ADD COLUMN IF NOT EXISTS example text;
