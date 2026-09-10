-- CONTRACT half of the pair started in 0063. DO NOT RUN THIS WITH THE OLD CODE
-- STILL DEPLOYED, and do not run it in the same maintenance step as 0063.
--
-- Run only after the multi-assign API + web build is live and verified. Once
-- this is applied, rolling the images back to a pre-multi-assign build will
-- break every ticket query, because that code selects tickets.assigned_to.
--
-- Verify the backfill covered everything before dropping:
--   SELECT count(*) FROM tickets t
--   WHERE t.assigned_to IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM ticket_assignees a
--                     WHERE a.ticket_id = t.id AND a.user_id = t.assigned_to);
--   -- must return 0
DROP INDEX IF EXISTS tickets_tenant_assigned_idx;
--> statement-breakpoint
ALTER TABLE tickets DROP COLUMN IF EXISTS assigned_to;
