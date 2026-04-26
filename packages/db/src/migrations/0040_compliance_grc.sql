-- Compliance GRC Module

CREATE TABLE IF NOT EXISTS compliance_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  version TEXT,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'built_in',
  is_active BOOLEAN NOT NULL DEFAULT true,
  nist_mapping_enabled BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_frameworks_tenant_idx ON compliance_frameworks(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS compliance_policy_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  framework_id UUID NOT NULL REFERENCES compliance_frameworks(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_policy_areas_framework_idx ON compliance_policy_areas(framework_id);

CREATE TABLE IF NOT EXISTS compliance_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  framework_id UUID NOT NULL REFERENCES compliance_frameworks(id),
  policy_area_id UUID NOT NULL REFERENCES compliance_policy_areas(id),
  control_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  guidance TEXT,
  nist_mapping TEXT,
  severity TEXT DEFAULT 'medium',
  control_type TEXT DEFAULT 'technical',
  assessment_method TEXT DEFAULT 'examine',
  sort_order INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_controls_framework_idx ON compliance_controls(framework_id, policy_area_id);
CREATE INDEX IF NOT EXISTS compliance_controls_nist_idx ON compliance_controls(tenant_id, nist_mapping);

CREATE TABLE IF NOT EXISTS compliance_customer_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  framework_id UUID NOT NULL REFERENCES compliance_frameworks(id),
  scope_source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'active',
  effective_date DATE,
  review_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_scopes_tenant_customer_idx ON compliance_customer_scopes(tenant_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_scopes_unique_idx ON compliance_customer_scopes(customer_id, framework_id);

CREATE TABLE IF NOT EXISTS compliance_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  framework_id UUID NOT NULL REFERENCES compliance_frameworks(id),
  title TEXT NOT NULL,
  assessment_type TEXT DEFAULT 'baseline',
  status TEXT DEFAULT 'draft',
  assessor_id UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_date DATE,
  overall_score INTEGER,
  summary TEXT,
  findings TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_assessments_tenant_customer_idx ON compliance_assessments(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS compliance_assessments_status_idx ON compliance_assessments(tenant_id, status);

CREATE TABLE IF NOT EXISTS compliance_assessment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  assessment_id UUID NOT NULL REFERENCES compliance_assessments(id),
  control_id UUID NOT NULL REFERENCES compliance_controls(id),
  status TEXT DEFAULT 'not_assessed',
  notes TEXT,
  findings TEXT,
  assigned_to UUID REFERENCES users(id),
  due_date DATE,
  last_reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_assessment_items_assessment_idx ON compliance_assessment_items(assessment_id);
CREATE INDEX IF NOT EXISTS compliance_assessment_items_status_idx ON compliance_assessment_items(assessment_id, status);

CREATE TABLE IF NOT EXISTS compliance_control_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  framework_id UUID NOT NULL REFERENCES compliance_frameworks(id),
  control_id UUID NOT NULL REFERENCES compliance_controls(id),
  status TEXT DEFAULT 'not_assessed',
  notes TEXT,
  assigned_to UUID REFERENCES users(id),
  due_date DATE,
  last_reviewed_at TIMESTAMPTZ,
  last_assessment_item_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_control_statuses_customer_idx ON compliance_control_statuses(tenant_id, customer_id, framework_id);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_control_statuses_unique_idx ON compliance_control_statuses(customer_id, control_id);

CREATE TABLE IF NOT EXISTS compliance_control_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_status_id UUID NOT NULL REFERENCES compliance_control_statuses(id),
  asset_id UUID NOT NULL REFERENCES assets(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_control_assets_unique_idx ON compliance_control_assets(control_status_id, asset_id);

CREATE TABLE IF NOT EXISTS compliance_control_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_status_id UUID NOT NULL REFERENCES compliance_control_statuses(id),
  ticket_id UUID NOT NULL REFERENCES tickets(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_control_tickets_unique_idx ON compliance_control_tickets(control_status_id, ticket_id);

CREATE TABLE IF NOT EXISTS compliance_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  title TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  description TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  storage_key TEXT,
  external_url TEXT,
  collected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  uploaded_by UUID REFERENCES users(id),
  uploaded_by_contact UUID REFERENCES contacts(id),
  tags JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_evidence_customer_idx ON compliance_evidence(tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS compliance_evidence_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES compliance_evidence(id),
  control_status_id UUID NOT NULL REFERENCES compliance_control_statuses(id),
  assessment_item_id UUID REFERENCES compliance_assessment_items(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_evidence_controls_unique_idx ON compliance_evidence_controls(evidence_id, control_status_id);

CREATE TABLE IF NOT EXISTS compliance_poam_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  framework_id UUID NOT NULL REFERENCES compliance_frameworks(id),
  control_id UUID REFERENCES compliance_controls(id),
  assessment_id UUID REFERENCES compliance_assessments(id),
  poam_number INTEGER NOT NULL,
  finding TEXT NOT NULL,
  risk_level TEXT DEFAULT 'medium',
  weakness TEXT,
  remediation_plan TEXT,
  responsible_party UUID REFERENCES users(id),
  scheduled_start_date DATE,
  scheduled_end_date DATE,
  actual_end_date DATE,
  milestones JSONB,
  status TEXT DEFAULT 'open',
  ticket_id UUID REFERENCES tickets(id),
  cost_estimate_cents INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_poam_customer_idx ON compliance_poam_items(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS compliance_poam_status_idx ON compliance_poam_items(tenant_id, status);

CREATE TABLE IF NOT EXISTS compliance_risk_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  risk_source TEXT,
  likelihood INTEGER NOT NULL,
  impact INTEGER NOT NULL,
  risk_score INTEGER NOT NULL,
  risk_response TEXT DEFAULT 'mitigate',
  response_details TEXT,
  status TEXT DEFAULT 'open',
  owner_id UUID REFERENCES users(id),
  control_id UUID REFERENCES compliance_controls(id),
  poam_id UUID REFERENCES compliance_poam_items(id),
  review_date DATE,
  last_reviewed_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_risk_customer_idx ON compliance_risk_items(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS compliance_risk_status_idx ON compliance_risk_items(tenant_id, status);

CREATE TABLE IF NOT EXISTS compliance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),
  framework_id UUID REFERENCES compliance_frameworks(id),
  title TEXT NOT NULL,
  policy_type TEXT NOT NULL,
  content TEXT,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  effective_date DATE,
  review_date DATE,
  ai_generated BOOLEAN DEFAULT false,
  control_ids JSONB,
  tags JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_policies_tenant_idx ON compliance_policies(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS compliance_policies_status_idx ON compliance_policies(tenant_id, status);

CREATE TABLE IF NOT EXISTS compliance_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  policy_id UUID NOT NULL REFERENCES compliance_policies(id),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  changed_by UUID REFERENCES users(id),
  change_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_policy_versions_idx ON compliance_policy_versions(policy_id);

CREATE TABLE IF NOT EXISTS compliance_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id UUID NOT NULL,
  description TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_activity_entity_idx ON compliance_activity_log(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS compliance_activity_customer_idx ON compliance_activity_log(tenant_id, customer_id);
