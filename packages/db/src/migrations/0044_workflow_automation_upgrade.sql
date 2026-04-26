-- Workflow automation engine upgrade

-- Add new columns to workflow_rules
ALTER TABLE workflow_rules ADD COLUMN IF NOT EXISTS rule_type TEXT NOT NULL DEFAULT 'instant';
ALTER TABLE workflow_rules ADD COLUMN IF NOT EXISTS time_config JSONB DEFAULT '{}';
ALTER TABLE workflow_rules ADD COLUMN IF NOT EXISTS exit_conditions JSONB DEFAULT '[]';
ALTER TABLE workflow_rules ADD COLUMN IF NOT EXISTS conditions_logic JSONB;
ALTER TABLE workflow_rules ADD COLUMN IF NOT EXISTS log_enabled BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE workflow_rules ADD COLUMN IF NOT EXISTS template_id UUID;
ALTER TABLE workflow_rules ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE workflow_rules ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS workflow_rules_type_active_idx ON workflow_rules(rule_type, is_active);
CREATE INDEX IF NOT EXISTS workflow_rules_tenant_category_idx ON workflow_rules(tenant_id, category);

-- Execution log
CREATE TABLE IF NOT EXISTS workflow_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  rule_id UUID NOT NULL REFERENCES workflow_rules(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL,
  conditions_matched BOOLEAN NOT NULL DEFAULT false,
  actions_executed JSONB DEFAULT '[]',
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wf_exec_log_tenant_idx ON workflow_execution_log(tenant_id);
CREATE INDEX IF NOT EXISTS wf_exec_log_rule_idx ON workflow_execution_log(rule_id);
CREATE INDEX IF NOT EXISTS wf_exec_log_ticket_idx ON workflow_execution_log(ticket_id);
CREATE INDEX IF NOT EXISTS wf_exec_log_executed_idx ON workflow_execution_log(executed_at);

-- Per-ticket timed rule execution tracker
CREATE TABLE IF NOT EXISTS workflow_ticket_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  rule_id UUID NOT NULL REFERENCES workflow_rules(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  execution_count INTEGER DEFAULT 0 NOT NULL,
  last_executed_at TIMESTAMPTZ,
  suppressed BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS wf_ticket_exec_uniq ON workflow_ticket_executions(rule_id, ticket_id);
CREATE INDEX IF NOT EXISTS wf_ticket_exec_tenant_idx ON workflow_ticket_executions(tenant_id);
