-- Portal-assigned compliance tasks
ALTER TABLE compliance_assessment_items ADD COLUMN IF NOT EXISTS assigned_to_contact UUID REFERENCES contacts(id);
ALTER TABLE compliance_assessment_items ADD COLUMN IF NOT EXISTS response_from_contact TEXT;
ALTER TABLE compliance_assessment_items ADD COLUMN IF NOT EXISTS response_date TIMESTAMPTZ;
ALTER TABLE compliance_assessment_items ADD COLUMN IF NOT EXISTS question_for_contact TEXT;

-- Control status portal assignment + auto-check tracking
ALTER TABLE compliance_control_statuses ADD COLUMN IF NOT EXISTS assigned_to_contact UUID REFERENCES contacts(id);
ALTER TABLE compliance_control_statuses ADD COLUMN IF NOT EXISTS last_auto_check_id UUID;
