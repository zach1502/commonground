-- Reverses drizzle/0001_project_closes_at.sql. Run it by hand with psql to roll back, before
-- drizzle/down/0000_init.sql if you roll back further.
ALTER TABLE "projects" DROP COLUMN IF EXISTS "closes_at";
