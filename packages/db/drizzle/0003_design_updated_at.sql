ALTER TABLE "designs" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "designs" SET "updated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "designs" ALTER COLUMN "updated_at" SET NOT NULL;
