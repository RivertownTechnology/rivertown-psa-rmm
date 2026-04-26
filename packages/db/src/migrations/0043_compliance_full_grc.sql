-- Asset Scope Mapping
CREATE TABLE IF NOT EXISTS compliance_scoped_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  framework_id UUID NOT NULL REFERENCES compliance_frameworks(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  network_zone TEXT,
  justification TEXT,
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_scoped_assets_customer_idx ON compliance_scoped_assets(tenant_id, customer_id, framework_id);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_scoped_assets_unique_idx ON compliance_scoped_assets(customer_id, framework_id, asset_id);

-- Personnel Screening / Background Checks
CREATE TABLE IF NOT EXISTS compliance_personnel_screening (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),
  contact_id UUID REFERENCES contacts(id),
  user_id UUID REFERENCES users(id),
  person_name TEXT NOT NULL,
  person_role TEXT,
  screening_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  submitted_date DATE,
  cleared_date DATE,
  expiration_date DATE,
  renewal_due_date DATE,
  agency_ori TEXT,
  document_storage_key TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_personnel_customer_idx ON compliance_personnel_screening(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS compliance_personnel_status_idx ON compliance_personnel_screening(tenant_id, status);
CREATE INDEX IF NOT EXISTS compliance_personnel_expiry_idx ON compliance_personnel_screening(expiration_date);

-- Training Records
CREATE TABLE IF NOT EXISTS compliance_training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),
  contact_id UUID REFERENCES contacts(id),
  user_id UUID REFERENCES users(id),
  person_name TEXT NOT NULL,
  training_type TEXT NOT NULL,
  training_provider TEXT,
  course_name TEXT,
  status TEXT DEFAULT 'assigned',
  assigned_date DATE,
  due_date DATE,
  completed_date DATE,
  expiration_date DATE,
  score INTEGER,
  certificate_storage_key TEXT,
  external_id TEXT,
  external_source TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_training_customer_idx ON compliance_training_records(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS compliance_training_status_idx ON compliance_training_records(tenant_id, status);
CREATE INDEX IF NOT EXISTS compliance_training_due_idx ON compliance_training_records(due_date);

-- Vendor / Business Associate Tracking
CREATE TABLE IF NOT EXISTS compliance_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  vendor_name TEXT NOT NULL,
  vendor_type TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  services_provided TEXT,
  data_access TEXT,
  agreement_type TEXT,
  agreement_status TEXT DEFAULT 'none',
  agreement_signed_date DATE,
  agreement_expiration_date DATE,
  agreement_storage_key TEXT,
  compliance_certifications JSONB,
  last_review_date DATE,
  next_review_date DATE,
  risk_level TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'active',
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_vendors_customer_idx ON compliance_vendors(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS compliance_vendors_status_idx ON compliance_vendors(tenant_id, status);

-- Security Incidents / Breach Log
CREATE TABLE IF NOT EXISTS compliance_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  incident_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  incident_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  data_types JSONB,
  affected_systems JSONB,
  affected_individuals INTEGER,
  discovered_at TIMESTAMPTZ,
  reported_at TIMESTAMPTZ,
  contained_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  reported_to JSONB,
  breach_notification JSONB,
  root_cause TEXT,
  remediation_actions TEXT,
  lessons_learned TEXT,
  status TEXT DEFAULT 'open',
  ticket_id UUID REFERENCES tickets(id),
  lead_investigator UUID REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_incidents_customer_idx ON compliance_incidents(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS compliance_incidents_status_idx ON compliance_incidents(tenant_id, status);
