-- Phase 1 of the contract + time tracking overhaul.
--
-- Adds three things:
--   1. coveragePolicy + overage/reset/expiry/warn fields on contract_line_items
--   2. defaultLaborLineItemId on contracts
--   3. contractId, contractLineItemId, classification, internalCategory,
--      costRateCents, billRateCents, costCents, billableCents, nonBillableReason
--      on ticket_time_entries (with snapshot semantics)
--
-- Backfills every existing row so the new not-null columns have correct values.
-- Orphan time entries (no resolvable contract) are marked classification='internal'
-- with internalCategory='admin' and contract_id=NULL — the seed-internal script
-- repoints them to the per-tenant Internal contract.

-- ============ contract_line_items ============
ALTER TABLE "contract_line_items" ADD COLUMN IF NOT EXISTS "coverage_policy" text;
ALTER TABLE "contract_line_items" ADD COLUMN IF NOT EXISTS "overage_rate_cents" integer;
ALTER TABLE "contract_line_items" ADD COLUMN IF NOT EXISTS "reset_cadence" text;          -- null | 'monthly' | 'quarterly' | 'annual'
ALTER TABLE "contract_line_items" ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
ALTER TABLE "contract_line_items" ADD COLUMN IF NOT EXISTS "warn_at_pct" integer DEFAULT 80 NOT NULL;

-- Backfill coverage_policy from existing item_type
UPDATE "contract_line_items"
SET "coverage_policy" = CASE
  WHEN "item_type" = 'block_time'                        THEN 'block'
  WHEN "item_type" IN ('recurring', 'per_device', 'per_user') THEN 'inclusive'
  WHEN "item_type" = 'one_time'                          THEN 'billable'
  ELSE 'inclusive'
END
WHERE "coverage_policy" IS NULL;

ALTER TABLE "contract_line_items" ALTER COLUMN "coverage_policy" SET NOT NULL;
ALTER TABLE "contract_line_items" ALTER COLUMN "coverage_policy" SET DEFAULT 'inclusive';

-- ============ contracts ============
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "default_labor_line_item_id" uuid
  REFERENCES "contract_line_items"("id");

-- Backfill default_labor_line_item_id from a sensible labor line per contract:
--   prefer block_time, then support_hours category, then any line, lowest sort_order first.
UPDATE "contracts" c
SET "default_labor_line_item_id" = sub.id
FROM (
  SELECT DISTINCT ON (cli.contract_id)
    cli.contract_id, cli.id
  FROM "contract_line_items" cli
  ORDER BY cli.contract_id,
           CASE
             WHEN cli.coverage_policy = 'block'                THEN 1
             WHEN cli.category = 'support_hours'               THEN 2
             WHEN cli.coverage_policy = 'billable'             THEN 3
             ELSE 4
           END,
           cli.sort_order NULLS LAST,
           cli.created_at
) sub
WHERE c.id = sub.contract_id
  AND c.default_labor_line_item_id IS NULL;

-- ============ ticket_time_entries ============
ALTER TABLE "ticket_time_entries" ADD COLUMN IF NOT EXISTS "contract_id" uuid REFERENCES "contracts"("id");
ALTER TABLE "ticket_time_entries" ADD COLUMN IF NOT EXISTS "contract_line_item_id" uuid REFERENCES "contract_line_items"("id");
ALTER TABLE "ticket_time_entries" ADD COLUMN IF NOT EXISTS "classification" text;          -- 'covered' | 'billable' | 'overage' | 'internal'
ALTER TABLE "ticket_time_entries" ADD COLUMN IF NOT EXISTS "internal_category" text;       -- 'admin' | 'training' | ...
ALTER TABLE "ticket_time_entries" ADD COLUMN IF NOT EXISTS "cost_rate_cents" integer;      -- snapshot
ALTER TABLE "ticket_time_entries" ADD COLUMN IF NOT EXISTS "bill_rate_cents" integer;      -- snapshot
ALTER TABLE "ticket_time_entries" ADD COLUMN IF NOT EXISTS "cost_cents" integer;           -- materialized
ALTER TABLE "ticket_time_entries" ADD COLUMN IF NOT EXISTS "billable_cents" integer;       -- materialized
ALTER TABLE "ticket_time_entries" ADD COLUMN IF NOT EXISTS "non_billable_reason" text;     -- 'communication' | 'goodwill' | 'rework' | 'travel'

-- Backfill contract_id from the ticket
UPDATE "ticket_time_entries" tte
SET "contract_id" = t."contract_id"
FROM "tickets" t
WHERE tte.ticket_id = t.id
  AND tte.contract_id IS NULL
  AND t.contract_id IS NOT NULL;

-- Backfill contract_line_item_id from contract.default_labor_line_item_id
UPDATE "ticket_time_entries" tte
SET "contract_line_item_id" = c."default_labor_line_item_id"
FROM "contracts" c
WHERE tte.contract_id = c.id
  AND tte.contract_line_item_id IS NULL
  AND c.default_labor_line_item_id IS NOT NULL;

-- Backfill cost_rate_cents = user.internal_cost_cents COALESCE tenant.default_internal_cost_cents COALESCE 7500
UPDATE "ticket_time_entries" tte
SET "cost_rate_cents" = COALESCE(u."internal_cost_cents", t."default_internal_cost_cents", 7500)
FROM "users" u, "tenants" t
WHERE tte.user_id = u.id
  AND tte.tenant_id = t.id
  AND tte.cost_rate_cents IS NULL;

-- Backfill bill_rate_cents in two passes.
-- Pass 1: prefer the entry's existing rate_cents (set by old logic), else line item unit price.
UPDATE "ticket_time_entries" tte
SET "bill_rate_cents" = COALESCE(tte."rate_cents", cli."unit_price_cents")
FROM "contract_line_items" cli
WHERE tte.contract_line_item_id = cli.id
  AND tte.bill_rate_cents IS NULL;

UPDATE "ticket_time_entries" tte
SET "bill_rate_cents" = COALESCE(tte."rate_cents", u."billable_rate_cents", t."default_billable_rate_cents", 15000)
FROM "users" u, "tenants" t
WHERE tte.user_id = u.id
  AND tte.tenant_id = t.id
  AND tte.bill_rate_cents IS NULL;

-- Backfill classification:
--   no contract_id → 'internal'
--   already-billed or marked billable → 'billable'
--   otherwise covered (managed services / inclusive)
UPDATE "ticket_time_entries"
SET "classification" = CASE
  WHEN "contract_id" IS NULL THEN 'internal'
  WHEN "is_billable" = true OR "is_billed" = true THEN 'billable'
  ELSE 'covered'
END
WHERE "classification" IS NULL;

UPDATE "ticket_time_entries"
SET "internal_category" = 'admin'
WHERE "classification" = 'internal' AND "internal_category" IS NULL;

-- Materialize cost_cents and billable_cents from duration + snapshots
UPDATE "ticket_time_entries"
SET "cost_cents" = COALESCE(ROUND(("duration_minutes"::numeric / 60.0) * "cost_rate_cents")::int, 0)
WHERE "cost_cents" IS NULL;

UPDATE "ticket_time_entries"
SET "billable_cents" = CASE
  WHEN "classification" IN ('billable', 'overage')
    THEN COALESCE(ROUND(("duration_minutes"::numeric / 60.0) * "bill_rate_cents")::int, 0)
  ELSE 0
END
WHERE "billable_cents" IS NULL;

-- Lock down NOT NULLs after backfill
ALTER TABLE "ticket_time_entries" ALTER COLUMN "classification"   SET NOT NULL;
ALTER TABLE "ticket_time_entries" ALTER COLUMN "cost_rate_cents"  SET NOT NULL;
ALTER TABLE "ticket_time_entries" ALTER COLUMN "cost_cents"       SET NOT NULL;
ALTER TABLE "ticket_time_entries" ALTER COLUMN "billable_cents"   SET NOT NULL;

ALTER TABLE "ticket_time_entries" ALTER COLUMN "cost_cents"     SET DEFAULT 0;
ALTER TABLE "ticket_time_entries" ALTER COLUMN "billable_cents" SET DEFAULT 0;

-- Indexes for the new query patterns
CREATE INDEX IF NOT EXISTS "time_entries_contract_idx"
  ON "ticket_time_entries" ("contract_id");
CREATE INDEX IF NOT EXISTS "time_entries_contract_line_idx"
  ON "ticket_time_entries" ("contract_line_item_id");
CREATE INDEX IF NOT EXISTS "time_entries_tenant_classification_idx"
  ON "ticket_time_entries" ("tenant_id", "classification", "is_billed");

-- Constraint: internal entries must have an internal_category
ALTER TABLE "ticket_time_entries"
  ADD CONSTRAINT "time_entries_internal_category_chk"
  CHECK ("classification" <> 'internal' OR "internal_category" IS NOT NULL);
