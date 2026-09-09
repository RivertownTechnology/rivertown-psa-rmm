-- Amazon Connect API integration. Additive and safe to re-run after manual pgAdmin installation.
CREATE TABLE IF NOT EXISTS connect_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  token_hash text NOT NULL,
  apple_business_id text NOT NULL,
  instance_arn text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS connect_credentials_hash_idx ON connect_credentials(token_hash);
CREATE INDEX IF NOT EXISTS connect_credentials_tenant_idx ON connect_credentials(tenant_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS connect_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  apple_business_id text NOT NULL,
  apple_customer_id text NOT NULL,
  contact_id uuid,
  verified_by uuid,
  verification_note text,
  verified_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS connect_identity_external_idx ON connect_identities(tenant_id, apple_business_id, apple_customer_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS connect_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  identity_id uuid NOT NULL REFERENCES connect_identities(id),
  instance_arn text NOT NULL,
  contact_id text NOT NULL,
  state text NOT NULL DEFAULT 'bot',
  state_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS connect_conversation_external_idx ON connect_conversations(tenant_id, instance_arn, contact_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS connect_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  conversation_id uuid NOT NULL REFERENCES connect_conversations(id),
  kind text NOT NULL,
  request_id text NOT NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  response jsonb NOT NULL,
  ticket_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS connect_operation_request_idx ON connect_operations(conversation_id, kind, request_id);
CREATE INDEX IF NOT EXISTS connect_operation_tenant_idx ON connect_operations(tenant_id, kind, created_at);
