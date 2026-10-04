ALTER TABLE "votes" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_comment_length_check" CHECK (char_length("votes"."comment") <= 500);