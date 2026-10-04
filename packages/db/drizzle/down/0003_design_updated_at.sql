-- Reverses drizzle/0003_design_updated_at.sql. Run it by hand with psql to roll back, before
-- drizzle/down/0002_rate_limit_buckets.sql if you roll back further.
ALTER TABLE "designs" DROP COLUMN IF EXISTS "updated_at";
