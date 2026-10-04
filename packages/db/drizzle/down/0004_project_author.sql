-- Reverses drizzle/0004_project_author.sql. Run it by hand with psql to roll back, before
-- drizzle/down/0003_design_updated_at.sql if you roll back further.
DROP INDEX IF EXISTS "projects_author_name_idx";
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_author_id_users_id_fk";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "author_id";
