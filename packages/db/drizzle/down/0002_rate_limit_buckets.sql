-- Reverses drizzle/0002_rate_limit_buckets.sql. Run it by hand with psql to roll back, before
-- drizzle/down/0001_project_closes_at.sql if you roll back further.
DROP TABLE IF EXISTS "rate_limit_buckets";
