-- Phase 3: period tracking + alert dedupe on block contract lines.
--
-- periodStartDate: when did the current period begin? Resolver filters time
--   entries by startedAt >= periodStartDate so monthly blocks reset cleanly.
--   NULL for one-time blocks (no period reset).
-- warnedAt: last time a "nearing threshold" alert was emailed for this line.
--   Dedupes repeat alerts within a period.
-- expiredNotifiedAt: last time an "expired" alert was sent for a one-time
--   block. Dedupes so the nightly job only emails once.

ALTER TABLE "contract_line_items" ADD COLUMN IF NOT EXISTS "period_start_date" date;
ALTER TABLE "contract_line_items" ADD COLUMN IF NOT EXISTS "warned_at" timestamptz;
ALTER TABLE "contract_line_items" ADD COLUMN IF NOT EXISTS "expired_notified_at" timestamptz;

-- Backfill period_start_date for existing block-with-reset lines to their
-- contract's startDate, so the first period appears to have started then.
UPDATE "contract_line_items" cli
SET "period_start_date" = c."start_date"
FROM "contracts" c
WHERE cli.contract_id = c.id
  AND cli.coverage_policy = 'block'
  AND cli.reset_cadence IS NOT NULL
  AND cli.period_start_date IS NULL;
