-- Reverses drizzle/0006_element_comments.sql. Run it by hand with psql to roll back, before
-- drizzle/down/0005_vote_comment.sql if you roll back further. It drops every element comment.
DROP TABLE IF EXISTS "element_comments";
