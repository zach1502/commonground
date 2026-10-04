ALTER TABLE "projects" ADD COLUMN "author_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_author_name_idx" ON "projects" USING btree ("author_id",lower("name"));