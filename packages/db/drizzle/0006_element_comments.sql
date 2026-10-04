CREATE TABLE "element_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"design_id" text NOT NULL,
	"element_id" text NOT NULL,
	"element_kind" text NOT NULL,
	"category" text NOT NULL,
	"surface_x" double precision,
	"surface_y" double precision,
	"author_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"status" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"reply_text" text,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "element_comments_kind_check" CHECK ("element_comments"."kind" in ('keep', 'move', 'change', 'remove', 'question')),
	CONSTRAINT "element_comments_status_check" CHECK ("element_comments"."status" in ('open', 'resolved')),
	CONSTRAINT "element_comments_element_kind_check" CHECK ("element_comments"."element_kind" in ('item', 'path', 'area')),
	CONSTRAINT "element_comments_text_length_check" CHECK (char_length("element_comments"."text") <= 280),
	CONSTRAINT "element_comments_reply_length_check" CHECK (char_length("element_comments"."reply_text") <= 500)
);
--> statement-breakpoint
ALTER TABLE "element_comments" ADD CONSTRAINT "element_comments_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element_comments" ADD CONSTRAINT "element_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "element_comments_design_idx" ON "element_comments" USING btree ("design_id");--> statement-breakpoint
CREATE UNIQUE INDEX "element_comments_open_unique" ON "element_comments" USING btree ("design_id","element_id","author_id","kind") WHERE "element_comments"."status" = 'open';