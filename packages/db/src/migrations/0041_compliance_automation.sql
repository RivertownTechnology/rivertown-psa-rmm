-- Compliance automation fields
ALTER TABLE compliance_controls ADD COLUMN IF NOT EXISTS automation_source TEXT;
ALTER TABLE compliance_controls ADD COLUMN IF NOT EXISTS automation_check TEXT;

-- Automated compliance checks table (integration data ingestion)
CREATE TABLE IF NOT EXISTS compliance_automated_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  control_status_id UUID REFERENCES compliance_control_statuses(id),
  source TEXT NOT NULL,
  check_type TEXT NOT NULL,
  result TEXT NOT NULL,
  details JSONB,
  asset_id UUID REFERENCES assets(id),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_auto_checks_customer_idx ON compliance_automated_checks(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS compliance_auto_checks_source_idx ON compliance_automated_checks(tenant_id, source, check_type);
CREATE INDEX IF NOT EXISTS compliance_auto_checks_control_idx ON compliance_automated_checks(control_status_id);
