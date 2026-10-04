-- Reverses drizzle/0005_vote_comment.sql. Run it by hand with psql to roll back, before
-- drizzle/down/0004_project_author.sql if you roll back further. It drops every vote comment.
ALTER TABLE "votes" DROP CONSTRAINT IF EXISTS "votes_comment_length_check";
ALTER TABLE "votes" DROP COLUMN IF EXISTS "comment";
