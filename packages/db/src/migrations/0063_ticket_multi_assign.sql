-- Multiple techs per ticket.
--
-- EXPAND half of an expand/contract pair. This migration is additive and safe
-- to run while the CURRENT code is still live: tickets.assigned_to is left in
-- place and backfilled into the new table, so old code keeps working. The
-- column is dropped separately in 0064, only after the new code is confirmed
-- healthy in production.
--
-- Deploy order that must be followed:
--   1. run 0063
--   2. deploy the API + web images
--   3. verify, then run 0064
CREATE TABLE IF NOT EXISTS ticket_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  assigned_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- One row per tech per ticket.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_assignees_unique_idx
  ON ticket_assignees (ticket_id, user_id);
--> statement-breakpoint

-- "Tickets assigned to me" is the hottest query against this table.
CREATE INDEX IF NOT EXISTS ticket_assignees_tenant_user_idx
  ON ticket_assignees (tenant_id, user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_assignees_ticket_idx
  ON ticket_assignees (ticket_id);
--> statement-breakpoint

-- Backfill every currently-assigned ticket. Idempotent: re-running adds nothing
-- because of the unique index above.
INSERT INTO ticket_assignees (tenant_id, ticket_id, user_id)
SELECT t.tenant_id, t.id, t.assigned_to
FROM tickets t
WHERE t.assigned_to IS NOT NULL
ON CONFLICT (ticket_id, user_id) DO NOTHING;
