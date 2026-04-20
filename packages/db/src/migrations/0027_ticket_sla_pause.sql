-- Ticket SLA pause support: track when SLA timer is paused and accumulated pause time
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "sla_paused_at" timestamptz;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "sla_total_paused_ms" integer DEFAULT 0;
