CREATE TABLE IF NOT EXISTS "csat_ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "ticket_id" uuid NOT NULL REFERENCES "tickets"("id"),
  "contact_id" uuid REFERENCES "contacts"("id"),
  "rating" integer,
  "comment" text,
  "token" text NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "csat_ratings_ticket_idx" ON "csat_ratings"("ticket_id");
CREATE INDEX IF NOT EXISTS "csat_ratings_token_idx" ON "csat_ratings"("token");
