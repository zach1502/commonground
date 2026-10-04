-- Reverses drizzle/0000_init.sql. drizzle-kit writes forward migrations only, so each one
-- gets a hand-written down file here; run it by hand with psql to roll back.
DROP TABLE IF EXISTS "votes";
DROP TABLE IF EXISTS "designs";
DROP TABLE IF EXISTS "projects";
DROP TABLE IF EXISTS "users";
