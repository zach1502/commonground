CREATE TABLE "designs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"blurb" text NOT NULL,
	"document" jsonb NOT NULL,
	"metrics" jsonb,
	"status" text NOT NULL,
	"forked_from" text,
	"version_of" text,
	"thumbnail_ref" text,
	"up" integer DEFAULT 0 NOT NULL,
	"down" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "designs_status_check" CHECK ("designs"."status" in ('draft', 'submitted', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"parcel" jsonb NOT NULL,
	"heightmap_ref" text NOT NULL,
	"baseline_design_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"display_name" text NOT NULL,
	"self_report" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('resident', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"design_id" text NOT NULL,
	"value" integer NOT NULL,
	"reasons" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "votes_user_design_unique" UNIQUE("user_id","design_id"),
	CONSTRAINT "votes_value_check" CHECK ("votes"."value" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "designs_project_status_idx" ON "designs" USING btree ("project_id","status");